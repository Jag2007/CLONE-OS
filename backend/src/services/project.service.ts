import { In, Repository } from "typeorm";
import { AppDataSource } from "../config/database";
import { Project } from "../entities/Project";
import { UserService } from "./user.service";
import { ActorService } from "./actor.service";
import { AppError } from "../middleware/errorHandler";
import { CreateProjectDTO, ProjectStatus } from "../types";
import { OpenAI } from "openai/client";
import { config } from "../config/env";
import { Scene, SceneStatus } from "../entities/Scene";
import { SceneSketch, SketchSource } from "../entities/SceneSketch";
import axios from "axios";
import { StorageService } from "./storage.service";

// Mirrors the multer fileFilter in src/routes/project.routes.ts.
// Keep these in sync — both the filter and the S3 path builder rely on this set.
const SKETCH_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

type ReplicatePrediction = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: {
    get?: string;
  };
};

export class ProjectService {
  private projectRepository: Repository<Project>;
  private userService: UserService;
  private actorService: ActorService;
  private openai: OpenAI;
  private sceneRepository: Repository<Scene>;
  private sceneSketchRepository: Repository<SceneSketch>;
  private storageService: StorageService;

  constructor() {
    this.projectRepository = AppDataSource.getRepository(Project);
    this.sceneRepository = AppDataSource.getRepository(Scene);
    this.sceneSketchRepository = AppDataSource.getRepository(SceneSketch);
    this.userService = new UserService();
    this.actorService = new ActorService();
    this.storageService = new StorageService();
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  private getWorkerAuthHeaders(): Record<string, string> {
    return config.workers.videoApiKey
      ? { Authorization: `Bearer ${config.workers.videoApiKey}` }
      : {};
  }

  private getReplicateHeaders(): Record<string, string> {
    if (!config.workers.replicateApiToken) {
      throw new AppError(
        400,
        "REPLICATE_API_TOKEN is missing in backend/.env. Add a valid Replicate API token and restart the backend.",
      );
    }

    return {
      Authorization: `Bearer ${config.workers.replicateApiToken}`,
      "Content-Type": "application/json",
    };
  }

  private buildReplicateVideoInput(imageUrl: string, prompt: string) {
    const input: Record<string, string | number> = {
      [config.workers.replicateVideoImageField]: imageUrl,
      [config.workers.replicateVideoPromptField]: prompt,
    };

    const duration = Number(config.workers.replicateVideoDuration);
    if (Number.isFinite(duration) && duration > 0) {
      input.duration = duration;
    }

    if (config.workers.replicateVideoAspectRatio) {
      input.aspect_ratio = config.workers.replicateVideoAspectRatio;
    }

    return input;
  }

  private extractReplicateOutputUrl(output: unknown): string | null {
    if (!output) return null;

    if (typeof output === "string") {
      return output;
    }

    if (Array.isArray(output)) {
      for (const item of output) {
        const url = this.extractReplicateOutputUrl(item);
        if (url) return url;
      }
      return null;
    }

    if (typeof output === "object") {
      for (const value of Object.values(output as Record<string, unknown>)) {
        const url = this.extractReplicateOutputUrl(value);
        if (url) return url;
      }
    }

    return null;
  }

  private async waitForReplicateVideo(
    initialPrediction: ReplicatePrediction,
  ): Promise<string> {
    let prediction = initialPrediction;
    const headers = this.getReplicateHeaders();
    const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);

    for (let attempt = 0; attempt < 90; attempt++) {
      if (prediction.status === "succeeded") {
        const videoUrl = this.extractReplicateOutputUrl(prediction.output);
        if (!videoUrl) {
          throw new AppError(
            502,
            "Replicate finished but did not return a video URL.",
          );
        }
        return videoUrl;
      }

      if (prediction.status && terminalStatuses.has(prediction.status)) {
        throw new AppError(
          502,
          `Replicate video generation ${prediction.status}: ${JSON.stringify(prediction.error ?? "No error details")}`,
        );
      }

      if (!prediction.urls?.get) {
        throw new AppError(
          502,
          "Replicate response did not include a polling URL.",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
      const pollResponse = await axios.get<ReplicatePrediction>(
        prediction.urls.get,
        { headers, timeout: 30000 },
      );
      prediction = pollResponse.data;
    }

    throw new AppError(504, "Replicate video generation timed out.");
  }

  private async createReplicateVideo(
    imageUrl: string,
    prompt: string,
  ): Promise<string> {
    if (!config.workers.replicateVideoModel) {
      throw new AppError(
        400,
        "REPLICATE_VIDEO_MODEL is missing in backend/.env.",
      );
    }

    try {
      const response = await axios.post<ReplicatePrediction>(
        "https://api.replicate.com/v1/predictions",
        {
          version: config.workers.replicateVideoModel,
          input: this.buildReplicateVideoInput(imageUrl, prompt),
        },
        {
          headers: {
            ...this.getReplicateHeaders(),
            Prefer: "wait=60",
          },
          timeout: 65000,
        },
      );

      return this.waitForReplicateVideo(response.data);
    } catch (error: any) {
      if (error instanceof AppError) throw error;

      const status = error?.response?.status;
      const providerMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error?.message;

      if (status === 401 || status === 403) {
        throw new AppError(
          502,
          "Replicate rejected the API token. Put a valid Replicate token in REPLICATE_API_TOKEN and restart the backend.",
        );
      }

      if (status === 422 || status === 400) {
        throw new AppError(
          502,
          `Replicate rejected the video request. Check REPLICATE_VIDEO_MODEL and input field env vars. ${providerMessage || ""}`.trim(),
        );
      }

      throw new AppError(
        502,
        `Replicate video generation failed: ${providerMessage || "Unknown error"}`,
      );
    }
  }

  private async generateOpenAIImageBuffer(prompt: string): Promise<Buffer> {
    const response = await this.openai.images.generate({
      model: config.openai.imageModel,
      prompt,
      n: 1,
      size: "1024x1024",
    });

    const image = response.data?.[0];
    if (!image) {
      throw new Error("No image data returned from OpenAI");
    }

    if ("b64_json" in image && image.b64_json) {
      return Buffer.from(image.b64_json, "base64");
    }

    if ("url" in image && image.url) {
      const imageResponse = await axios.get(image.url, {
        responseType: "arraybuffer",
      });
      return Buffer.from(imageResponse.data);
    }

    throw new Error("OpenAI image response did not include image bytes or URL");
  }

  async createProject(data: CreateProjectDTO): Promise<Project> {
    const project = this.projectRepository.create({
      user: { id: data.userId },
      actorId: data.actorId || null,
      projectName: data.projectName,
      scriptText: data.scriptText || null,
      status: "draft" as unknown as Project["status"],
    } as any);

    const saved = await this.projectRepository.save(project);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async getProjectById(id: string): Promise<Project | null> {
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ["user", "scenes"],
    });
    if (project?.scenes) {
      await this.hydrateActiveSketches(project.scenes);
    }
    return project;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    const projects = await this.projectRepository.find({
      where: { user: { id: userId } },
      relations: ["scenes"],
      order: { createdAt: "DESC" },
    });
    const allScenes = projects.flatMap((p) => p.scenes ?? []);
    await this.hydrateActiveSketches(allScenes);
    return projects;
  }

  /**
   * Attach each scene's currently-active SceneSketch row (source + history id)
   * onto `scene.activeSketch`. One batched query per call, regardless of how
   * many scenes are passed in. Scenes without an active sketch get `null`.
   */
  private async hydrateActiveSketches(scenes: Scene[]): Promise<void> {
    if (scenes.length === 0) return;

    const sceneIds = scenes.map((s) => s.id);
    const activeSketches = await this.sceneSketchRepository.find({
      where: { sceneId: In(sceneIds), isActive: true },
    });

    const bySceneId = new Map<string, SceneSketch>();
    for (const sketch of activeSketches) {
      bySceneId.set(sketch.sceneId, sketch);
    }

    for (const scene of scenes) {
      scene.activeSketch = bySceneId.get(scene.id) ?? null;
    }
  }

  async renderProject(
    projectId: string,
    userId: string,
    actorId: string,
  ): Promise<{ jobId: string; message: string; videoUrl?: string }> {
    // 1. Validate project exists and belongs to user
    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new AppError(404, "Project not found");
    }

    if (!project.user || project.user.id !== userId) {
      throw new AppError(403, "Access denied: Project does not belong to user");
    }

    if (project.status === "processing") {
      throw new AppError(409, "Project is already being processed");
    }

    // 2. Validate actor exists and get cost
    const actor = await this.actorService.getActorById(actorId);
    if (!actor) {
      throw new AppError(404, "Actor not found");
    }

    const scenes = [...(project.scenes ?? [])].sort(
      (a, b) => a.sequenceOrder - b.sequenceOrder,
    );
    const sourceScene = scenes.find((scene) => scene.finalImageUrl || scene.sketchUrl);
    const sourceImageUrl = sourceScene?.finalImageUrl || sourceScene?.sketchUrl;

    if (!sourceImageUrl) {
      throw new AppError(
        400,
        "Generate or upload storyboard images before generating video.",
      );
    }

    const storyboardPrompt = scenes
      .map((scene) => `Scene ${scene.sequenceOrder}: ${scene.scriptText || scene.aiPrompt || ""}`)
      .filter(Boolean)
      .join("\n");
    const videoPrompt = [
      project.scriptText,
      storyboardPrompt,
      actor?.name ? `Featured actor: ${actor.name}.` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);

    // 3. Check and deduct credits transactionally
    await this.userService.deductCredits(userId, actor.costPerVideo);

    // 4. Update project status (use update() to avoid cascading stale scenes relation)
    await this.projectRepository.update(projectId, {
      status: ProjectStatus.PROCESSING,
      actorId: actor.id,
    });

    try {
      const videoUrl = await this.createReplicateVideo(sourceImageUrl, videoPrompt);
      await this.projectRepository.update(projectId, {
        status: ProjectStatus.COMPLETED,
        storageUrl: videoUrl,
        actorId: actor.id,
      });

      return {
        jobId: projectId,
        message: "Video generated successfully.",
        videoUrl,
      };
    } catch (error) {
      await this.projectRepository.update(projectId, {
        status: ProjectStatus.CASTING,
      });
      await this.userService.addCredits(userId, actor.costPerVideo);
      throw error;
    }
  }

  async updateProjectStatus(
    projectId: string,
    status: "draft" | "processing" | "completed",
    storageUrl?: string,
  ): Promise<Project> {
    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new AppError(404, "Project not found");
    }

    project.status =
      ProjectStatus[status.toUpperCase() as keyof typeof ProjectStatus];
    if (storageUrl) {
      project.storageUrl = storageUrl;
    }

    return this.projectRepository.save(project);
  }

  async generateScript(projectId: string, prompt: string): Promise<Scene[]> {
    const project = await this.getProjectById(projectId);
    if (!project) throw new AppError(404, "Project not found");

    // 1. Call OpenAI "Director"
    let completion;
    try {
      completion = await this.openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "system",
      content: `You are a professional video director and expert cinematographer. Break the user's request into a storyboard of 4-6 distinct scenes. 
      Return a JSON object with a key "scenes" containing an array. 

      Required JSON Structure:
      {
        "scenes": [
          {
            "sequenceOrder": 1,
            "scriptText": "Voiceover or action description...",
            "aiPrompt": "Detailed cinematic description"
          }
        ]
      }

      For the "aiPrompt", follow this specific structure:
      [SHOT TYPE], [SUBJECT & ACTION], [ENVIRONMENT & SETTING], [LIGHTING SETUP], [LENS & DEPTH OF FIELD], [CAMERA ANGLE & MOVEMENT], [FOCUS POINT & PULLING], [COLOR GRADE & FILM LOOK], [MOOD & ATMOSPHERE], [ASPECT RATIO], [TECHNICAL REFERENCE]

      KNOWLEDGE BASE TO UTILIZE:
      - SHOT TYPES: EWS, WS, FS (Long Shot), MWS, MS, MCU, CU, ECU, OTS, POV, Aerial.
      - MISE-EN-SCÈNE: Gestalt laws (Proximity, Similarity, Continuity), Symmetry, Leading lines, Negative space, Layered depth.
      - CAMERA: Eye-level, Low/High angle, Dutch angle, Overhead. Movement: Dolly, Pan, Tilt, Tracking, Steadicam, Whip pan, Zolly.
      - OPTICS: Wide (14mm), Standard (50mm), Telephoto (85mm+), Anamorphic (oval bokeh), Tilt-shift, Macro.
      - FOCUS: Focus pulling, Rack focus, Soft vs Hard focus, Shallow DoF, Foreground blur.
      - LIGHTING: Three-point, Chiaroscuro, Rembrandt, Motivated, Practical, Magic hour, Golden hour, Neon, Silhouette.
      - LOOK & GENRE: Magic Realism, Slice of Life, Realism, Neo-noir, Teal & Orange, Bleach bypass, Film grain, Halation.
      - TECHNICAL: ARRI Alexa 65, RED Monstro, Kodak Vision3 500T, 2.39:1 or 1.85:1 aspect ratios.
       Here is your updated system prompt as a continuous paragraph:

You are an expert cinematographer and visual storytelling AI. Your job is to transform any scene description into a richly detailed, cinematic image prompt for AI image generation (DALL·E / Stable Diffusion / Midjourney). You have deep knowledge of professional filmmaking, cinematography, and visual aesthetics. Always use precise film industry terminology in your output prompts. Your knowledge base includes: Shot Types (Extreme Wide Shot, Wide Shot, Full Shot/Long Shot, Medium Wide Shot, Medium Shot, Medium Close-Up, Close-Up, Extreme Close-Up, Over-the-Shoulder, Two-Shot, Insert Shot, Cutaway, POV Shot, Aerial Shot, Bird's Eye View, Worm's Eye View); Mise-en-scène (set design, costume and makeup, props, blocking, hair and wardrobe, spatial relationships, environmental storytelling through visual elements); Camera Angles (Eye-level, Low angle, High angle, Dutch angle/canted, Overhead/top-down, Canted frame, Oblique angle); Camera Movement (Static/locked off, Dolly in/out, Pan left/right, Tilt up/down, Truck left/right, Pedestal up/down, Crane shot, Boom shot, Handheld/shaky/kinetic, Steadicam/smooth/floating, Whip pan, Zolly/dolly zoom/Vertigo effect, Rack focus, Follow shot, Arc shot, Tracking shot); Lens & Optics (Wide angle 14mm/24mm, Standard 35mm/50mm, Telephoto 85mm/135mm/200mm, Anamorphic lens, Tilt-shift, Macro, Prime vs zoom); Depth of Field & Focus (Shallow DoF/bokeh, Deep DoF, Rack focus, Bokeh, Foreground element blur, Hard focus, Soft focus, Focus pulling, Split diopter, Tilt-shift focus, Breathing, Fixed focus); Lighting Setups (Three-point lighting, High-key, Low-key, Chiaroscuro, Rembrandt lighting, Split lighting, Butterfly/Paramount lighting, Motivated light, Practical lights, Natural light, Hard light, Soft light, Backlighting/Rim lighting, Golden hour, Magic hour, Neon/practical color, Silhouette); Color Grading & Film Look (Warm grade, Cool grade, Teal and orange, Desaturated, High contrast, Low contrast, Film grain, Halation, Vignette, Cross-processed, Black and white, Bleach bypass, LUT applied); Film Stocks & Camera References (Kodak Vision3 500T, Fuji Eterna, Kodak Portra 400, ARRI Alexa 65, RED Monstro, Sony Venice, Panavision, 1970s New Hollywood, 1980s neon, classic Hollywood golden age); Aspect Ratios (1.33:1/4:3, 1.78:1/16:9, 1.85:1, 2.39:1 anamorphic, 2.76:1 Ultra Panavision); Composition Rules including Gestalt Laws (Rule of thirds, Golden ratio/Fibonacci spiral, Symmetry, Leading lines, Foreground framing, Negative space, Headroom, Looking room/Nose room, Layered depth, Environmental storytelling, Proximity, Similarity, Continuity, Closure, Figure-Ground, Common Fate); and Mood & Genre References (Film noir, Neo-noir, Epic/Blockbuster, Indie film, Horror, Sci-fi, Western, Romance, Documentary, Magic realism, Realism, Slice of life). When given a scene description, output a prompt in this structure: [SHOT TYPE], [MISE-EN-SCÈNE], [SUBJECT & ACTION], [ENVIRONMENT & SETTING], [LIGHTING SETUP], [LENS & DEPTH OF FIELD], [CAMERA ANGLE & MOVEMENT], [FOCUS POINT & PULLING], [COLOR GRADE & FILM LOOK], [MOOD & ATMOSPHERE], [ASPECT RATIO], [TECHNICAL REFERENCE]. Always include at least one term from each category, match the mood of the scene precisely, be specific with terminology like "Rembrandt lighting" instead of "dramatic lighting," prefer cinematic aspect ratios 1.85:1 or 2.39:1 unless told otherwise, and never output generic descriptions—every prompt must feel like a director's shot list entry.`
    },
    { role: "user", content: `Create a script for: ${prompt}` },
  ],
  response_format: { type: "json_object" },
      });
    } catch (error: any) {
      if (error?.code === "invalid_api_key" || error?.status === 401) {
        throw new AppError(
          502,
          "OpenAI API key is invalid. Update OPENAI_API_KEY in backend/.env and restart the backend.",
        );
      }

      if (error?.status === 429) {
        throw new AppError(
          502,
          "OpenAI request was rate limited or has insufficient quota.",
        );
      }

      throw error;
    }

    // 2. Parse the result
    const content = completion.choices[0].message.content;
    console.log("OpenAI Script Generation Response:", content);

    if (!content)
      throw new AppError(500, "Failed to generate script content from AI");

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      console.error("JSON Parse failed:", content);
      throw new AppError(500, "Failed to parse AI response");
    }

    // Robust extraction: Check 'scenes' (primary), 'storyboard' (fallback), or root array
    const scenesData =
      parsed.scenes ||
      parsed.storyboard ||
      (Array.isArray(parsed) ? parsed : []);

    if (!Array.isArray(scenesData) || scenesData.length === 0) {
      console.error("⚠️ Invalid structure returned:", parsed);
      throw new AppError(500, "AI returned invalid storyboard structure");
    }

    // 3. Save Scenes to DB
    // Use this.sceneRepository instead of creating a new variable if properly initialized in constructor
    await this.sceneRepository.delete({ project: { id: projectId } });

    const savedScenes: Scene[] = [];

    for (const s of scenesData) {
      const scene = this.sceneRepository.create({
        projectId: projectId,
        sequenceOrder: s.sequenceOrder,
        scriptText: s.scriptText,
        aiPrompt: s.aiPrompt,
        status: SceneStatus.PENDING,
      });
      savedScenes.push(await this.sceneRepository.save(scene));
    }

    // 4. Persist prompt and update project status (use update() to avoid cascading stale scenes relation)
    await this.projectRepository.update(projectId, {
      scriptText: prompt,
      status: ProjectStatus.STORYBOARDING,
    });

    return savedScenes;
  }

  // src/services/project.service.ts

  // ... inside ProjectService class ...

  async generateSketches(projectId: string): Promise<Scene[]> {
    const scenes = await this.sceneRepository.find({
      where: { project: { id: projectId } },
      order: { sequenceOrder: "ASC" },
    });

    if (scenes.length === 0) {
      throw new AppError(404, "No scenes found. Generate script first.");
    }

    // We process scenes in parallel to speed it up
    const promises = scenes.map(async (scene) => {
      // Skip if already sketched to save money
      if (scene.sketchUrl) return scene;

      try {
        const imageBuffer = await this.generateOpenAIImageBuffer(
          `Storyboard sketch, black and white graphite pencil style, clean lines, professional cinematic framing: ${scene.aiPrompt || scene.scriptText}`,
        );

        // Timestamped path so each generation is stored separately in S3.
        const timestamp = Date.now();
        const s3Path = `projects/${projectId}/sketches/${scene.id}/ai-${timestamp}.png`;

        const permanentUrl = await this.storageService.uploadBuffer(
          imageBuffer,
          s3Path,
          "image/png",
        );

        // Record in history and set as the active sketch
        await this.recordSketch(scene, permanentUrl, SketchSource.AI);
      } catch (error) {
        console.error(
          `Failed to generate sketch for scene ${scene.id}:`,
          error,
        );
        // We continue even if one fails
      }
      return scene;
    });

    const updatedScenes = await Promise.all(promises);
    return updatedScenes;
  }

  /**
   * Persist a new sketch in the history table and promote it to active.
   * Previous sketches for the scene are preserved but marked inactive.
   * Also updates scene.sketchUrl so existing consumers keep working.
   * Runs in a single transaction so the history row and the Scene's
   * denormalized pointer can't drift.
   */
  private async recordSketch(
    scene: Scene,
    url: string,
    source: SketchSource,
  ): Promise<SceneSketch> {
    const newStatus =
      scene.status === SceneStatus.PENDING ? SceneStatus.SKETCHED : scene.status;

    const saved = await AppDataSource.transaction(async (manager) => {
      // Demote any currently-active sketches for this scene (history preserved).
      await manager.update(
        SceneSketch,
        { sceneId: scene.id, isActive: true },
        { isActive: false },
      );

      const sketch = manager.create(SceneSketch, {
        sceneId: scene.id,
        url,
        source,
        isActive: true,
      });
      const inserted = await manager.save(sketch);

      await manager.update(
        Scene,
        { id: scene.id },
        { sketchUrl: url, status: newStatus },
      );

      return inserted;
    });

    // Keep the in-memory scene object in sync with the persisted state.
    scene.sketchUrl = url;
    scene.status = newStatus;

    return saved;
  }

  /**
   * Bulk upload user-provided sketches for every scene in a project.
   * Files are matched to scenes positionally in sequenceOrder ASC.
   * Existing AI or user sketches are preserved in history (scene_sketches),
   * only the active pointer is moved to the new upload.
   */
  async uploadStoryboard(
    projectId: string,
    files: Express.Multer.File[],
  ): Promise<Scene[]> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });
    if (!project) throw new AppError(404, "Project not found");

    const scenes = await this.sceneRepository.find({
      where: { project: { id: projectId } },
      order: { sequenceOrder: "ASC" },
    });

    if (scenes.length === 0) {
      throw new AppError(
        400,
        "No scenes found. Generate the script first before uploading sketches.",
      );
    }

    if (!files || files.length !== scenes.length) {
      throw new AppError(
        400,
        `Expected ${scenes.length} sketches (one per scene), got ${files?.length ?? 0}.`,
      );
    }

    // Each (scene, file) pair is independent — run uploads in parallel.
    return Promise.all(
      scenes.map((scene, i) => this.storeUserSketch(scene, files[i])),
    );
  }

  /**
   * Upload a user-provided sketch for a single scene (targeted upload).
   * Preserves any previously stored sketch (ai or user) in history.
   */
  async uploadSceneSketch(
    sceneId: string,
    file: Express.Multer.File,
  ): Promise<Scene> {
    const scene = await this.sceneRepository.findOne({
      where: { id: sceneId },
    });
    if (!scene) throw new AppError(404, "Scene not found");
    if (!scene.projectId) {
      throw new AppError(400, "Scene is not attached to a project.");
    }

    return this.storeUserSketch(scene, file);
  }

  /**
   * List the full sketch history for a scene, newest first.
   * Returns an empty array if the scene has no sketches (or doesn't exist).
   */
  async getSceneSketches(sceneId: string): Promise<SceneSketch[]> {
    return this.sceneSketchRepository.find({
      where: { sceneId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Fetch the active sketch image bytes for download (server-side; avoids browser CORS).
   */
  async getSceneSketchDownloadBuffer(
    sceneId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const scene = await this.sceneRepository.findOne({
      where: { id: sceneId },
      relations: ["project", "project.user"],
    });
    if (!scene) {
      throw new AppError(404, "Scene not found");
    }
    const project = scene.project;
    if (!project?.user || project.user.id !== userId) {
      throw new AppError(403, "Access denied: Project does not belong to user");
    }
    if (!scene.sketchUrl) {
      throw new AppError(404, "No sketch for this scene");
    }

    const response = await axios.get(scene.sketchUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
    });

    const rawType = response.headers["content-type"];
    const contentType =
      typeof rawType === "string"
        ? rawType.split(";")[0].trim()
        : "image/png";

    let ext = "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      ext = "jpg";
    } else if (contentType.includes("webp")) {
      ext = "webp";
    } else if (contentType.includes("png")) {
      ext = "png";
    }

    const filename = `scene-${scene.sequenceOrder}-sketch.${ext}`;
    return {
      buffer: Buffer.from(response.data as ArrayBuffer),
      contentType: contentType || "image/png",
      filename,
    };
  }

  private async storeUserSketch(
    scene: Scene,
    file: Express.Multer.File,
  ): Promise<Scene> {
    const projectId = scene.projectId;
    if (!projectId) {
      throw new AppError(400, "Scene is not attached to a project.");
    }

    const ext = SKETCH_MIME_TO_EXT[file.mimetype] ?? "png";
    const s3Path = `projects/${projectId}/sketches/${scene.id}/user-${Date.now()}.${ext}`;

    const permanentUrl = await this.storageService.uploadBuffer(
      file.buffer,
      s3Path,
      file.mimetype,
    );

    await this.recordSketch(scene, permanentUrl, SketchSource.USER);
    return scene;
  }

  async generateFinalImages(projectId: string): Promise<Scene[]> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) throw new AppError(404, "Project not found");
    if (!project.actorId) throw new AppError(400, "Actor must be selected");

    const actor = await this.actorService.getActorById(project.actorId);
    if (!actor) throw new AppError(404, "Actor data not found");

    const scenes = await this.sceneRepository.find({
      where: { project: { id: projectId } },
      order: { sequenceOrder: "ASC" },
    });

    const updatedScenes: Scene[] = [];

    for (const scene of scenes) {
      // OPTIMIZATION: Skip if already has an image
      if (scene.finalImageUrl) {
        updatedScenes.push(scene);
        continue;
      }

      // Use the helper function
      const updated = await this.processSceneImage(scene, actor, projectId);
      if (updated) updatedScenes.push(updated);
    }

    project.status = "casting" as any;
    await this.projectRepository.save(project);

    return updatedScenes;
  }

  // 2. NEW: Regenerate Single Scene
  async regenerateScene(sceneId: string, newPrompt?: string): Promise<Scene> {
    const scene = await this.sceneRepository.findOne({
      where: { id: sceneId },
      relations: ["project"], // Need access to parent project
    });

    if (!scene) throw new AppError(404, "Scene not found");

    // Update prompt if provided
    if (newPrompt) {
      scene.aiPrompt = newPrompt;
      await this.sceneRepository.save(scene); // Save new prompt to DB
    }

    // Get Actor info from the parent project
    const project = scene.project;
    if (!project?.actorId)
      throw new AppError(400, "Project has no actor assigned");

    const actor = await this.actorService.getActorById(project.actorId);
    if (!actor) throw new AppError(404, "Actor not found");

    // Force generate (helper function)
    const updated = await this.processSceneImage(scene, actor, project.id);

    if (!updated) throw new AppError(500, "Image generation failed");
    return updated;
  }

  // 3. PRIVATE HELPER (The shared logic)
  private async processSceneImage(
    scene: Scene,
    actor: any,
    projectId: string,
  ): Promise<Scene | null> {
    try {
      const basePrompt = scene.aiPrompt || scene.scriptText;
      const finalPrompt = `full body shot of ${actor.triggerWord}, ${basePrompt}, photorealistic, 8k, cinematic lighting`;

      console.log(`Generating: ${finalPrompt}`);

      const imageBuffer = await this.generateOpenAIImageBuffer(finalPrompt);

      if (imageBuffer) {
        // Add a timestamp to the path to avoid S3 caching if regenerating
        const timestamp = Date.now();
        const s3Path = `projects/${projectId}/final/${scene.id}_${timestamp}.png`;

        const permanentUrl = await this.storageService.uploadBuffer(
          imageBuffer,
          s3Path,
          "image/png",
        );

        scene.finalImageUrl = permanentUrl;
        scene.status = SceneStatus.LORA_PROCESSED;
        return await this.sceneRepository.save(scene);
      }
    } catch (error) {
      console.error(`Failed to generate scene ${scene.id}:`, error);
    }
    return null;
  }

  // ... inside ProjectService class ...

  async compileFullMovie(projectId: string): Promise<string> {
    const project = await this.getProjectById(projectId);
    if (!project) throw new AppError(404, "Project not found");

    // 1. Get all scenes ordered by sequence
    const scenes = await this.sceneRepository.find({
      where: { project: { id: projectId } },
      order: { sequenceOrder: "ASC" },
    });

    if (scenes.length < 2) {
      throw new AppError(400, "Need at least 2 scenes to create a movie");
    }

    const transitionTasks: { index: number; taskId: string }[] = [];

    const pythonApiUrl = config.workers.videoWorkerApiUrl;

    console.log(
      `Starting compilation for Project ${projectId} with ${scenes.length} scenes`,
    );

    // 2. Loop through scenes to create (N-1) transition videos
    for (let i = 0; i < scenes.length - 1; i++) {
      const startScene = scenes[i];
      const endScene = scenes[i + 1];

      // Validation: Ensure we actually have images to animate between
      if (!startScene.finalImageUrl || !endScene.finalImageUrl) {
        throw new AppError(
          400,
          `Scenes ${startScene.sequenceOrder} and ${endScene.sequenceOrder} must have final images generated first.`,
        );
      }

      try {
        console.log(`Requesting transition: Scene ${i + 1} -> ${i + 2}`);

        // Call Python Endpoint 1: Generate Transition
        const response = await axios.post(
          `${pythonApiUrl}/generate-transition`,
          {
            first_frame_url: startScene.finalImageUrl,
            last_frame_url: endScene.finalImageUrl,
            prompt: `Smooth cinematic transition, ${startScene.scriptText} to ${endScene.scriptText}`,
          },
          { headers: this.getWorkerAuthHeaders() },
        );

        transitionTasks.push({
          index: i,
          taskId: response.data.task_id,
        });
      } catch (error) {
        console.error(
          `Failed to submit transition for scenes ${i} -> ${i + 1}`,
          error,
        );
        throw new AppError(
          500,
          `Failed to contact Video Worker: ${(error as any).message}`,
        );
      }
    }

    // 3. Poll for completion
    const videoUrls: string[] = new Array(transitionTasks.length);
    let completedCount = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // Timeout after 5 minutes (60 * 5s)

    while (completedCount < transitionTasks.length) {
      if (attempts++ > MAX_ATTEMPTS) {
        throw new AppError(504, "Video generation timed out");
      }

      console.log(
        `Polling status... (${completedCount}/${transitionTasks.length} complete)`,
      );

      for (const task of transitionTasks) {
        if (videoUrls[task.index]) continue; // Skip if done

        try {
          const statusRes = await axios.get(
            `${pythonApiUrl}/status/${task.taskId}`,
            { headers: this.getWorkerAuthHeaders() },
          );
          const { status, video_url } = statusRes.data;

          if (status === "succeeded" && video_url) {
            videoUrls[task.index] = video_url;
            completedCount++;
            console.log(`Transition ${task.index} completed.`);
          } else if (status === "failed") {
            throw new Error(`Task ${task.taskId} failed generation`);
          }
        } catch (err) {
          console.error(
            `Error polling task ${task.taskId}:`,
            (err as any).message,
          );
        }
      }

      // Wait 5 seconds before next check
      if (completedCount < transitionTasks.length) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log("All clips generated. Stitching...");

    // 4. Call Python Endpoint 2: Stitch Videos
    try {
      const stitchResponse = await axios.post(`${pythonApiUrl}/stitch`, {
        project_id: projectId,
        video_urls: videoUrls,
      }, { headers: this.getWorkerAuthHeaders() });

      const finalMovieUrl = stitchResponse.data.final_url;

      // 5. Save final URL to project
      project.storageUrl = finalMovieUrl;
      project.status = "completed" as any; // Cast to bypass strict enum typing if needed
      await this.projectRepository.save(project);

      return finalMovieUrl;
    } catch (error) {
      console.error("Stitching failed:", error);
      throw new AppError(500, "Failed to stitch final movie");
    }
  }
}
