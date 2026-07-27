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
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";

// Mirrors the multer fileFilter in src/routes/project.routes.ts.
// Keep these in sync — both the filter and the S3 path builder rely on this set.
const SKETCH_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};
const BACKEND_ROOT = path.resolve(__dirname, "../..");
const execFileAsync = promisify(execFile);

type RunPodJobResponse = {
  id?: string;
  jobId?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  delayTime?: number;
  executionTime?: number;
};

type RunPodRunResponse = RunPodJobResponse & {
  error?: unknown;
};

type UserCloneInfo = {
  model_name?: string | null;
  s3_url?: string | null;
  weights_url?: string | null;
};

type RunPodImageVariables = {
  sketchBase64: string;
  prompt: string;
  triggerWord: string;
  loraName: string;
  loraUrl: string;
  width: number;
  height: number;
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

  private getRequestedDurationSeconds(prompt: string): number {
    const normalized = prompt.toLowerCase();
    const minuteMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:minute|minutes|min|mins)\b/);
    if (minuteMatch) {
      return Math.max(5, Math.round(Number(minuteMatch[1]) * 60));
    }

    const secondMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:second|seconds|sec|secs|s)\b/);
    if (secondMatch) {
      return Math.max(5, Math.round(Number(secondMatch[1])));
    }

    return 30;
  }

  private getSceneCountForDuration(durationSeconds: number): number {
    const sceneDuration = Number(config.workers.videoDuration);
    const secondsPerScene = Number.isFinite(sceneDuration) && sceneDuration > 0 ? sceneDuration : 5;
    return Math.max(1, Math.ceil(durationSeconds / secondsPerScene));
  }

  private getWorkerAuthHeaders(): Record<string, string> {
    if (!config.workers.videoApiKey) return {};
    const authScheme = config.workers.videoAuthScheme.trim();
    return {
      Authorization: authScheme
        ? `${authScheme} ${config.workers.videoApiKey}`
        : config.workers.videoApiKey,
    };
  }

  private getRunPodHeaders(): Record<string, string> {
    if (!config.workers.runpodApiKey) {
      throw new AppError(
        400,
        "RUNPOD_API_KEY is missing in backend/.env. Add a valid RunPod API key and restart the backend.",
      );
    }

    const authScheme = config.workers.runpodAuthScheme.trim();

    return {
      Authorization: authScheme
        ? `${authScheme} ${config.workers.runpodApiKey}`
        : config.workers.runpodApiKey,
      "Content-Type": "application/json",
    };
  }

  private getRunPodEndpointBaseUrl(endpointId = config.workers.runpodEndpointId): string {
    if (!endpointId) {
      throw new AppError(
        400,
        "RUNPOD_ENDPOINT_ID is missing in backend/.env. Create a RunPod Serverless endpoint and add its endpoint ID.",
      );
    }

    return `${config.workers.runpodBaseUrl}/${endpointId}`;
  }

  private getValueByPath(source: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((current, part) => {
      if (current == null) return undefined;
      if (/^\d+$/.test(part) && Array.isArray(current)) {
        return current[Number(part)];
      }
      if (typeof current === "object") {
        return (current as Record<string, unknown>)[part];
      }
      return undefined;
    }, source);
  }

  private buildRunPodVideoInput(imageUrl: string, prompt: string) {
    const input: Record<string, string | number> = {
      [config.workers.runpodVideoImageField]: imageUrl,
      [config.workers.runpodVideoPromptField]: prompt,
    };

    const duration = Number(config.workers.runpodVideoDuration);
    if (Number.isFinite(duration) && duration > 0) {
      input.duration = duration;
    }

    if (config.workers.runpodVideoAspectRatio) {
      input.aspect_ratio = config.workers.runpodVideoAspectRatio;
    }

    return input;
  }

  private extractVideoUrl(output: unknown): string | null {
    if (!output) return null;

    if (typeof output === "string") {
      return output;
    }

    if (Array.isArray(output)) {
      for (const item of output) {
        const url = this.extractVideoUrl(item);
        if (url) return url;
      }
      return null;
    }

    if (typeof output === "object") {
      const outputRecord = output as Record<string, unknown>;
      const configuredValue = this.getValueByPath(
        outputRecord,
        config.workers.runpodVideoOutputField,
      );
      const configuredUrl = this.extractVideoUrl(configuredValue);
      if (configuredUrl) return configuredUrl;

      for (const value of Object.values(outputRecord)) {
        const url = this.extractVideoUrl(value);
        if (url) return url;
      }
    }

    return null;
  }

  private buildWanVideoInput(imageUrl: string, prompt: string) {
    const duration = Number(config.workers.videoDuration);
    const resolvedDuration = Number.isFinite(duration) && duration > 0 ? duration : 5;
    const model = config.workers.videoModel;
    const isLegacy = model.startsWith("wan2.1-");
    const input: Record<string, unknown> = {
      [config.workers.videoPromptField]: prompt,
    };

    if (isLegacy) {
      input.img_url = imageUrl;
    } else {
      input.media = [{ type: "first_frame", url: imageUrl }];
    }

    return {
      model,
      input,
      parameters: {
        resolution: config.workers.videoResolution,
        ...(isLegacy
          ? {}
          : {
              ratio: config.workers.videoRatio,
              [config.workers.videoDurationField]: resolvedDuration,
            }),
      },
    };
  }

  private getWanTaskUrl(taskId: string): string {
    if (config.workers.videoTaskBaseUrl) {
      return `${config.workers.videoTaskBaseUrl}/${taskId}`;
    }

    const generateUrl = new URL(config.workers.videoWorkerApiUrl);
    if (generateUrl.pathname.endsWith("/api/generate")) {
      generateUrl.pathname = generateUrl.pathname.replace(
        /\/api\/generate$/,
        `/api/tasks/${taskId}`,
      );
      return generateUrl.toString();
    }

    return new URL(`/api/tasks/${taskId}`, generateUrl.origin).toString();
  }

  private getWanUploadUrl(): string {
    const generateUrl = new URL(config.workers.videoWorkerApiUrl);
    if (generateUrl.pathname.endsWith("/api/generate")) {
      generateUrl.pathname = generateUrl.pathname.replace(/\/api\/generate$/, "/api/upload");
      return generateUrl.toString();
    }

    return new URL("/api/upload", generateUrl.origin).toString();
  }

  private buildMultipart(parts: Array<{
    name: string;
    value?: string;
    filename?: string;
    contentType?: string;
    data?: Buffer;
  }>) {
    const boundary = `dcverse-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const buffers: Buffer[] = [];

    for (const part of parts) {
      buffers.push(Buffer.from(`--${boundary}\r\n`));
      if (part.data) {
        buffers.push(
          Buffer.from(
            `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename || "file"}"\r\n` +
              `Content-Type: ${part.contentType || "application/octet-stream"}\r\n\r\n`,
          ),
        );
        buffers.push(part.data);
        buffers.push(Buffer.from("\r\n"));
      } else {
        buffers.push(
          Buffer.from(
            `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value || ""}\r\n`,
          ),
        );
      }
    }

    buffers.push(Buffer.from(`--${boundary}--\r\n`));

    return {
      boundary,
      body: Buffer.concat(buffers),
    };
  }

  private async uploadImageForWan(imageUrl: string): Promise<string> {
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
    });
    const sourceBuffer = Buffer.from(imageResponse.data as ArrayBuffer);
    const imageBuffer = await sharp(sourceBuffer)
      .rotate()
      .resize({
        width: 1280,
        height: 720,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const contentType = "image/jpeg";
    const filename = "scene.jpg";

    if (config.workers.videoImageHostApiKey) {
      const { boundary, body } = this.buildMultipart([
        { name: "key", value: config.workers.videoImageHostApiKey },
        { name: "format", value: "json" },
        {
          name: "source",
          filename,
          contentType,
          data: imageBuffer,
        },
      ]);

      const uploadResponse = await axios.post(
        config.workers.videoImageHostApiUrl,
        body,
        {
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length,
          },
          timeout: 120000,
        },
      );
      const hostedUrl = this.getValueByPath(
        uploadResponse.data,
        config.workers.videoImageHostOutputField,
      );

      if (typeof hostedUrl === "string" && hostedUrl) {
        return hostedUrl;
      }

      throw new AppError(
        502,
        `Image host upload failed before WAN video generation: ${JSON.stringify(uploadResponse.data)}`,
      );
    }

    const { boundary, body } = this.buildMultipart([
      {
        name: "file",
        filename,
        contentType,
        data: imageBuffer,
      },
    ]);

    const uploadResponse = await axios.post(this.getWanUploadUrl(), body, {
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
      timeout: 120000,
    });

    if (!uploadResponse.data?.url) {
      throw new AppError(
        502,
        `Alan upload failed before WAN video generation: ${JSON.stringify(uploadResponse.data)}`,
      );
    }

    return uploadResponse.data.url;
  }

  private async waitForWanVideo(taskId: string): Promise<string> {
    for (let attempt = 0; attempt < config.workers.runpodMaxPollAttempts; attempt++) {
      await new Promise((resolve) =>
        setTimeout(resolve, config.workers.runpodPollIntervalMs),
      );

      const response = await axios.get(this.getWanTaskUrl(taskId), {
        headers: this.getWorkerAuthHeaders(),
        timeout: 30000,
      });
      const status = String(
        this.getValueByPath(response.data, config.workers.videoTaskStatusField) || "",
      ).toUpperCase();

      if (status === "SUCCEEDED") {
        const configuredValue = this.getValueByPath(
          response.data,
          config.workers.videoOutputField,
        );
        const configuredUrl = this.extractVideoUrl(configuredValue);
        const fallbackUrl = this.extractVideoUrl(response.data);
        const videoUrl = configuredUrl || fallbackUrl;
        if (!videoUrl) {
          throw new AppError(
            502,
            `WAN task succeeded but no video URL was found at ${config.workers.videoOutputField}.`,
          );
        }
        return videoUrl;
      }

      if (status === "FAILED" || status === "CANCELED" || status === "CANCELLED") {
        throw new AppError(
          502,
          `WAN video task ${status}: ${JSON.stringify(response.data?.output?.message || response.data?.message || response.data)}`,
        );
      }
    }

    throw new AppError(504, "WAN video generation timed out.");
  }

  private async createWanVideoClip(imageUrl: string, prompt: string): Promise<string> {
    if (!config.workers.videoWorkerApiUrl) {
      throw new AppError(400, "VIDEO_WORKER_API_URL is missing in backend/.env.");
    }

    try {
      const publicImageUrl = await this.uploadImageForWan(imageUrl);
      const response = await axios.post(
        config.workers.videoWorkerApiUrl,
        this.buildWanVideoInput(publicImageUrl, prompt),
        {
          headers: {
            "Content-Type": "application/json",
            ...(config.workers.videoAsyncHeaderName && config.workers.videoAsyncHeaderValue
              ? {
                  [config.workers.videoAsyncHeaderName]:
                    config.workers.videoAsyncHeaderValue,
                }
              : {}),
            ...this.getWorkerAuthHeaders(),
          },
          timeout: 900000,
        },
      );

      const taskIdValue = this.getValueByPath(
        response.data,
        config.workers.videoTaskIdField,
      );
      if (typeof taskIdValue === "string" && taskIdValue) {
        return this.waitForWanVideo(taskIdValue);
      }

      const configuredValue = this.getValueByPath(
        response.data,
        config.workers.videoOutputField,
      );
      const configuredUrl = this.extractVideoUrl(configuredValue);
      const fallbackUrl = this.extractVideoUrl(response.data);
      const videoUrl = configuredUrl || fallbackUrl;

      if (!videoUrl) {
        throw new AppError(
          502,
          `WAN video completed but no video URL was found at ${config.workers.videoOutputField}.`,
        );
      }

      return videoUrl;
    } catch (error: any) {
      if (error instanceof AppError) throw error;

      const status = error?.response?.status;
      const providerMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.code ||
        error?.message;

      if (status === 401 || status === 403) {
        throw new AppError(
          502,
          "WAN rejected VIDEO_API_KEY. Check backend/.env.",
        );
      }

      throw new AppError(
        502,
        `WAN video generation failed at ${config.workers.videoWorkerApiUrl}: ${providerMessage || "Unknown error"}`,
      );
    }
  }

  private async stitchVideoClips(
    clipUrls: string[],
    projectId: string,
  ): Promise<string> {
    if (clipUrls.length === 1) return clipUrls[0];

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `dcverse-${projectId}-`));

    try {
      const clipPaths: string[] = [];
      for (let i = 0; i < clipUrls.length; i++) {
        const response = await axios.get(clipUrls[i], {
          responseType: "arraybuffer",
          timeout: 300000,
        });
        const clipPath = path.join(workDir, `clip-${String(i).padStart(2, "0")}.mp4`);
        await fs.writeFile(clipPath, Buffer.from(response.data as ArrayBuffer));
        clipPaths.push(clipPath);
      }

      const listPath = path.join(workDir, "clips.txt");
      await fs.writeFile(
        listPath,
        clipPaths.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`).join("\n"),
      );

      const outputPath = path.join(workDir, "final.mp4");
      try {
        await execFileAsync("ffmpeg", [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c",
          "copy",
          outputPath,
        ]);
      } catch (execError: any) {
        if (execError?.code === "ENOENT") {
          if (process.platform === "win32") {
            try {
              const userHome = os.homedir();
              const fallbackPath = path.join(
                userHome,
                "AppData",
                "Local",
                "Microsoft",
                "WinGet",
                "Packages",
                "Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe",
                "ffmpeg-8.1.1-essentials_build",
                "bin",
                "ffmpeg.exe"
              );
              await execFileAsync(fallbackPath, [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                listPath,
                "-c",
                "copy",
                outputPath,
              ]);
            } catch (fallbackError: any) {
              console.error(
                "ERROR: 'ffmpeg' not found on system PATH and fallback path failed:",
                fallbackError
              );
              throw new AppError(
                500,
                "Video stitching failed: 'ffmpeg' utility is not installed or accessible on the server. Please install ffmpeg and try again.",
              );
            }
          } else {
            // On Linux/Mac, immediately throw when default ffmpeg isn't found
            throw new AppError(
              500,
              "Video stitching failed: 'ffmpeg' utility is not installed on the server. Please install ffmpeg and try again.",
            );
          }
        } else {
          throw execError;
        }
      }

      const finalBuffer = await fs.readFile(outputPath);
      return this.storageService.uploadBuffer(
        finalBuffer,
        `projects/${projectId}/videos/final_${Date.now()}.mp4`,
        "video/mp4",
      );
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  private extractBase64Image(output: unknown): string | null {
    if (!output) return null;

    if (typeof output === "string") {
      if (output.startsWith("data:image/")) {
        return output.split(",", 2)[1] || null;
      }
      return output;
    }

    if (Array.isArray(output)) {
      for (const item of output) {
        const data = this.extractBase64Image(item);
        if (data) return data;
      }
      return null;
    }

    if (typeof output === "object") {
      const outputRecord = output as Record<string, unknown>;
      const configuredValue = this.getValueByPath(
        outputRecord,
        config.workers.runpodImageOutputField,
      );
      const configuredData = this.extractBase64Image(configuredValue);
      if (configuredData) return configuredData;

      for (const value of Object.values(outputRecord)) {
        const data = this.extractBase64Image(value);
        if (data) return data;
      }
    }

    return null;
  }

  private async waitForRunPodJob(
    initialJob: RunPodJobResponse,
    endpointId: string,
  ): Promise<RunPodJobResponse> {
    let job = initialJob;
    const jobId = job.id || job.jobId;
    const headers = this.getRunPodHeaders();
    const endpointBaseUrl = this.getRunPodEndpointBaseUrl(endpointId);
    const terminalStatuses = new Set([
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "CANCELED",
      "TIMED_OUT",
    ]);

    if (!jobId) {
      throw new AppError(502, "RunPod did not return a job ID.");
    }

    for (let attempt = 0; attempt < config.workers.runpodMaxPollAttempts; attempt++) {
      const status = job.status?.toUpperCase();

      if (status === "COMPLETED") {
        return job;
      }

      if (status && terminalStatuses.has(status)) {
        throw new AppError(
          502,
          `RunPod generation ${status}: ${JSON.stringify(job.error ?? "No error details")}`,
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, config.workers.runpodPollIntervalMs),
      );
      const pollResponse = await axios.get<RunPodJobResponse>(
        `${endpointBaseUrl}/status/${jobId}`,
        { headers, timeout: 30000 },
      );
      job = pollResponse.data;
    }

    throw new AppError(504, "RunPod generation timed out.");
  }

  private async submitRunPodJob(
    endpointId: string,
    input: unknown,
  ): Promise<RunPodJobResponse> {
    const endpointBaseUrl = this.getRunPodEndpointBaseUrl(endpointId);
    const body =
      input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      Object.prototype.hasOwnProperty.call(input, "input")
        ? input
        : { input };

    const response = await axios.post<RunPodRunResponse>(
      `${endpointBaseUrl}/runsync`,
      JSON.stringify(body),
      {
        headers: this.getRunPodHeaders(),
        timeout: config.workers.runpodExecutionTimeoutMs,
      },
    );

    const status = response.data.status?.toUpperCase();
    if (status === "COMPLETED" || response.data.output) {
      return response.data;
    }

    if (status === "FAILED" || status === "CANCELLED" || status === "CANCELED") {
      throw new AppError(
        502,
        `RunPod generation ${status}: ${JSON.stringify(response.data.error ?? "No error details")}`,
      );
    }

    return this.waitForRunPodJob(response.data, endpointId);
  }

  private async createRunPodVideo(
    imageUrl: string,
    prompt: string,
  ): Promise<string> {
    try {
      const endpointId = config.workers.runpodEndpointId;
      if (!endpointId) {
        throw new AppError(400, "RUNPOD_ENDPOINT_ID is missing in backend/.env.");
      }

      const job = await this.submitRunPodJob(
        endpointId,
        this.buildRunPodVideoInput(imageUrl, prompt),
      );
      const videoUrl = this.extractVideoUrl(job.output);
      if (!videoUrl) {
        throw new AppError(
          502,
          `RunPod completed but did not return a video URL in output.${config.workers.runpodVideoOutputField}.`,
        );
      }
      return videoUrl;
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
          "RunPod rejected the API key. Put a valid RunPod key in RUNPOD_API_KEY and restart the backend.",
        );
      }

      if (status === 404) {
        throw new AppError(
          502,
          "RunPod endpoint was not found. Check RUNPOD_ENDPOINT_ID.",
        );
      }

      if (status === 422 || status === 400) {
        throw new AppError(
          502,
          `RunPod rejected the video request. Check RUNPOD_VIDEO_* input field env vars and your worker handler schema. ${providerMessage || ""}`.trim(),
        );
      }

      throw new AppError(
        502,
        `RunPod video generation failed: ${providerMessage || "Unknown error"}`,
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

  private async imageUrlToBase64(url: string): Promise<string> {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 120000,
    });
    return Buffer.from(response.data as ArrayBuffer).toString("base64");
  }

  private async getCurrentUserClone(authHeader?: string): Promise<UserCloneInfo | null> {
    if (!authHeader) return null;

    try {
      const response = await axios.get<UserCloneInfo>(
        `${config.workers.trainingApiUrl}/me/clone`,
        {
          headers: { Authorization: authHeader },
          timeout: 30000,
        },
      );
      return response.data ?? null;
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      console.warn(
        "Could not fetch current user clone:",
        error?.response?.data?.detail || error?.response?.data?.error || error?.message,
      );
      return null;
    }
  }

  private replaceTemplateVariables(value: unknown, vars: RunPodImageVariables): unknown {
    if (typeof value === "string") {
      const replacements: Record<string, string> = {
        "{{SKETCH_BASE64}}": vars.sketchBase64,
        "{{PROMPT}}": vars.prompt,
        "{{TRIGGER_WORD}}": vars.triggerWord,
        "{{LORA_NAME}}": vars.loraName,
        "{{LORA_URL}}": vars.loraUrl,
        "{{WIDTH}}": String(vars.width),
        "{{HEIGHT}}": String(vars.height),
      };

      return Object.entries(replacements).reduce(
        (result, [token, replacement]) => result.split(token).join(replacement),
        value,
      );
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.replaceTemplateVariables(item, vars));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          this.replaceTemplateVariables(item, vars),
        ]),
      );
    }

    return value;
  }

  private async buildRunPodImageInput(vars: RunPodImageVariables): Promise<unknown> {
    if (config.workers.runpodImageInputTemplatePath) {
      const templatePath = path.isAbsolute(config.workers.runpodImageInputTemplatePath)
        ? config.workers.runpodImageInputTemplatePath
        : path.resolve(BACKEND_ROOT, config.workers.runpodImageInputTemplatePath);
      const rawTemplate = await fs.readFile(templatePath, "utf8");
      const template = JSON.parse(rawTemplate);
      const payload = this.replaceTemplateVariables(template, vars);

      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const payloadRecord = payload as Record<string, any>;
        const input = payloadRecord.input;
        const workflow = input?.workflow;

        if (workflow && typeof workflow === "object") {
          if (workflow["19"]?.inputs) {
            workflow["19"].inputs.value = vars.prompt;
          }
          if (workflow["21"]?.inputs) {
            workflow["21"].inputs.image = "image.png";
          }
          if (workflow["22"]?.inputs && vars.loraName) {
            workflow["22"].inputs.lora_name = vars.loraName;
          }
        }

        if (input && Array.isArray(input.images)) {
          input.images[0] = {
            ...(input.images[0] || {}),
            name: "image.png",
            image: vars.sketchBase64,
          };
        }
      }

      return payload;
    }

    throw new AppError(
      500,
      "RunPod final-image workflow is missing. Add final_input.json and set RUNPOD_IMAGE_INPUT_TEMPLATE_PATH in backend/.env.",
    );
  }

  private async createRunPodFinalImage(
    scene: Scene,
    actor: any,
    authHeader?: string,
  ): Promise<Buffer> {
    if (!scene.sketchUrl) {
      throw new AppError(
        400,
        `Scene ${scene.sequenceOrder} needs a sketch before final image generation.`,
      );
    }

    const endpointId = config.workers.runpodImageEndpointId;
    if (!endpointId) {
      throw new AppError(
        400,
        "RUNPOD_IMAGE_ENDPOINT_ID or RUNPOD_ENDPOINT_ID is missing in backend/.env.",
      );
    }

    const clone = await this.getCurrentUserClone(authHeader);
    const cloneName = clone?.model_name?.trim();
    const triggerWord = cloneName || actor.triggerWord || actor.name?.toLowerCase();
    const loraUrl = clone?.s3_url || clone?.weights_url || "";
    const loraName = cloneName ? `${cloneName}.safetensors` : "";
    const basePrompt = scene.aiPrompt || scene.scriptText || "";
    const prompt = `full body shot of ${triggerWord}, ${basePrompt}, photorealistic, cinematic lighting, 16:9`;

    const sketchBase64 = await this.imageUrlToBase64(scene.sketchUrl);
    const input = await this.buildRunPodImageInput({
      sketchBase64,
      prompt,
      triggerWord,
      loraName,
      loraUrl,
      width: config.workers.runpodImageWidth,
      height: config.workers.runpodImageHeight,
    });

    const job = await this.submitRunPodJob(endpointId, input);
    const outputBase64 = this.extractBase64Image(job.output);
    if (!outputBase64) {
      throw new AppError(
        502,
        `RunPod completed but did not return base64 image data at output.${config.workers.runpodImageOutputField}.`,
      );
    }

    return Buffer.from(outputBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
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
    const scenesWithFinalImages = scenes.filter((scene) => scene.finalImageUrl);
    if (scenesWithFinalImages.length === 0) {
      throw new AppError(
        400,
        "Generate final realistic images before generating video.",
      );
    }

    // 3. Check and deduct credits transactionally
    await this.userService.deductCredits(userId, actor.costPerVideo);

    // 4. Update project status (use update() to avoid cascading stale scenes relation)
    await this.projectRepository.update(projectId, {
      status: ProjectStatus.PROCESSING,
      actorId: actor.id,
    });

    // 5. Kick off background video generation (fire-and-forget)
    this.runVideoGeneration(projectId, userId, actor, scenesWithFinalImages).catch((error) => {
      console.error(`Background video generation failed for project ${projectId}:`, error);
    });

    return {
      jobId: projectId,
      message: "Video rendering started. This may take a few minutes.",
    };
  }

  private async generateVideoMotionPrompts(scenes: Scene[]): Promise<string[]> {
    try {
      const sceneData = scenes.map(s => ({
        sequenceOrder: s.sequenceOrder,
        scriptText: s.scriptText,
        aiPrompt: s.aiPrompt || ""
      }));

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert video director and AI video synthesis prompt engineer.
Your task is to take a sequence of storyboard scenes and generate a concise, motion-focused prompt (20 to 50 words) for each scene. These prompts will be fed into an Image-to-Video model (like HappyHorse / Wan 2.1).

The video model starts with the final static image. It does NOT need to be told static properties (like camera models, lens focal length, lighting setups, aspect ratios, or specific clothing colors) because these are already baked into the image.
Instead, focus on:
1. Physical actions and movements of the subject (e.g. "smiling while slowly unwrapping a package", "head bobbing to the music").
2. Dynamic, cinematic camera movements (e.g. "slow camera push-in", "gentle horizontal camera panning").
3. Atmospheric changes (e.g. "wind blowing through hair", "raindrops falling").

CRITICAL:
- Do NOT include meta-instructions (e.g., "generate a smooth video", "no subtitles") or conversational filler.
- Enforce visual connection/continuity: Ensure the camera movements across consecutive scenes connect logically or flow smoothly (e.g., if scene 1 has a pan right, scene 2 can continue panning right or slowly push in; avoid random, conflicting camera motions).

Return a JSON object with a key "motionPrompts" containing an array of strings in the exact order of the input scenes.
Structure:
{
  "motionPrompts": [
    "motion prompt for scene 1",
    "motion prompt for scene 2",
    ...
  ]
}`
          },
          {
            role: "user",
            content: `Scenes Sequence:\n${JSON.stringify(sceneData, null, 2)}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("No response content from OpenAI");
      
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.motionPrompts) && parsed.motionPrompts.length === scenes.length) {
        return parsed.motionPrompts;
      }
      throw new Error("Invalid or mismatched motionPrompts array length returned");
    } catch (error) {
      console.error("Failed to generate bulk motion prompts, falling back to scriptText for all scenes:", error);
      return scenes.map(s => s.scriptText);
    }
  }

  private async runVideoGeneration(
    projectId: string,
    userId: string,
    actor: any,
    scenesWithFinalImages: Scene[],
  ): Promise<void> {
    try {
      const clipUrls: string[] = [];
      console.log(`Generating optimized motion prompts for project ${projectId}...`);
      const motionPrompts = await this.generateVideoMotionPrompts(scenesWithFinalImages);

      for (let i = 0; i < scenesWithFinalImages.length; i++) {
        const scene = scenesWithFinalImages[i];
        const prompt = motionPrompts[i] || scene.scriptText;
        console.log(`Generated Motion Prompt for Scene ${scene.sequenceOrder}: "${prompt}"`);

        const clipUrl = await this.createWanVideoClip(scene.finalImageUrl!, prompt);
        clipUrls.push(clipUrl);
      }

      const videoUrl = await this.stitchVideoClips(clipUrls, projectId);
      await this.projectRepository.update(projectId, {
        status: ProjectStatus.COMPLETED,
        storageUrl: videoUrl,
        actorId: actor.id,
      });
      console.log(`Video generation successfully completed for project ${projectId}.`);
    } catch (error) {
      console.error(`Background video generation failed for project ${projectId}:`, error);
      await this.projectRepository.update(projectId, {
        status: ProjectStatus.CASTING,
      });
      await this.userService.addCredits(userId, actor.costPerVideo);
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
    const requestedDurationSeconds = this.getRequestedDurationSeconds(prompt);
    const sceneCount = this.getSceneCountForDuration(requestedDurationSeconds);
    const secondsPerScene = Number(config.workers.videoDuration) || 5;

    // 1. Call OpenAI "Director"
    let completion;
    try {
      completion = await this.openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "system",
      content: `You are a professional video director and expert cinematographer. Break the user's request into exactly ${sceneCount} distinct scenes for a ${requestedDurationSeconds}-second commercial. Each scene should represent about ${secondsPerScene} seconds of screen time.
      Always write scriptText and aiPrompt in English only. Do not use any other language.
      Keep the commercial framed for 16:9 video.
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
      - TECHNICAL: ARRI Alexa 65, RED Monstro, Kodak Vision3 500T, 16:9 / 1.78:1 aspect ratio.
       Here is your updated system prompt as a continuous paragraph:

You are an expert cinematographer and visual storytelling AI. Your job is to transform any scene description into a richly detailed, cinematic image prompt for AI image generation (DALL·E / Stable Diffusion / Midjourney). You have deep knowledge of professional filmmaking, cinematography, and visual aesthetics. Always use precise film industry terminology in your output prompts. Your knowledge base includes: Shot Types (Extreme Wide Shot, Wide Shot, Full Shot/Long Shot, Medium Wide Shot, Medium Shot, Medium Close-Up, Close-Up, Extreme Close-Up, Over-the-Shoulder, Two-Shot, Insert Shot, Cutaway, POV Shot, Aerial Shot, Bird's Eye View, Worm's Eye View); Mise-en-scène (set design, costume and makeup, props, blocking, hair and wardrobe, spatial relationships, environmental storytelling through visual elements); Camera Angles (Eye-level, Low angle, High angle, Dutch angle/canted, Overhead/top-down, Canted frame, Oblique angle); Camera Movement (Static/locked off, Dolly in/out, Pan left/right, Tilt up/down, Truck left/right, Pedestal up/down, Crane shot, Boom shot, Handheld/shaky/kinetic, Steadicam/smooth/floating, Whip pan, Zolly/dolly zoom/Vertigo effect, Rack focus, Follow shot, Arc shot, Tracking shot); Lens & Optics (Wide angle 14mm/24mm, Standard 35mm/50mm, Telephoto 85mm/135mm/200mm, Anamorphic lens, Tilt-shift, Macro, Prime vs zoom); Depth of Field & Focus (Shallow DoF/bokeh, Deep DoF, Rack focus, Bokeh, Foreground element blur, Hard focus, Soft focus, Focus pulling, Split diopter, Tilt-shift focus, Breathing, Fixed focus); Lighting Setups (Three-point lighting, High-key, Low-key, Chiaroscuro, Rembrandt lighting, Split lighting, Butterfly/Paramount lighting, Motivated light, Practical lights, Natural light, Hard light, Soft light, Backlighting/Rim lighting, Golden hour, Magic hour, Neon/practical color, Silhouette); Color Grading & Film Look (Warm grade, Cool grade, Teal and orange, Desaturated, High contrast, Low contrast, Film grain, Halation, Vignette, Cross-processed, Black and white, Bleach bypass, LUT applied); Film Stocks & Camera References (Kodak Vision3 500T, Fuji Eterna, Kodak Portra 400, ARRI Alexa 65, RED Monstro, Sony Venice, Panavision, 1970s New Hollywood, 1980s neon, classic Hollywood golden age); Aspect Ratios (1.78:1/16:9); Composition Rules including Gestalt Laws (Rule of thirds, Golden ratio/Fibonacci spiral, Symmetry, Leading lines, Foreground framing, Negative space, Headroom, Looking room/Nose room, Layered depth, Environmental storytelling, Proximity, Similarity, Continuity, Closure, Figure-Ground, Common Fate); and Mood & Genre References (Film noir, Neo-noir, Epic/Blockbuster, Indie film, Horror, Sci-fi, Western, Romance, Documentary, Magic realism, Realism, Slice of life). When given a scene description, output a prompt in this structure: [SHOT TYPE], [MISE-EN-SCÈNE], [SUBJECT & ACTION], [ENVIRONMENT & SETTING], [LIGHTING SETUP], [LENS & DEPTH OF FIELD], [CAMERA ANGLE & MOVEMENT], [FOCUS POINT & PULLING], [COLOR GRADE & FILM LOOK], [MOOD & ATMOSPHERE], [ASPECT RATIO], [TECHNICAL REFERENCE]. Always include at least one term from each category, match the mood of the scene precisely, be specific with terminology like "Rembrandt lighting" instead of "dramatic lighting," use 16:9 / 1.78:1 aspect ratio, and never output generic descriptions—every prompt must feel like a director's shot list entry.`
    },
    { role: "user", content: `Create exactly ${sceneCount} English storyboard scenes for this ${requestedDurationSeconds}-second 16:9 commercial: ${prompt}` },
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

    const normalizedScenesData = scenesData.slice(0, sceneCount);
    if (normalizedScenesData.length !== sceneCount) {
      throw new AppError(
        500,
        `AI returned ${normalizedScenesData.length} scenes, expected ${sceneCount}. Please regenerate the script.`,
      );
    }

    // 3. Save Scenes to DB
    // Use this.sceneRepository instead of creating a new variable if properly initialized in constructor
    await this.sceneRepository.delete({ project: { id: projectId } });

    const savedScenes: Scene[] = [];

    for (let i = 0; i < normalizedScenesData.length; i++) {
      const s = normalizedScenesData[i];
      const scene = this.sceneRepository.create({
        projectId: projectId,
        sequenceOrder: i + 1,
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

    const updatedScenes: Scene[] = [];
    for (const scene of scenes) {
      updatedScenes.push(await this.generateSceneSketch(scene.id));
    }
    return updatedScenes;
  }

  async generateSceneSketch(sceneId: string): Promise<Scene> {
    const scene = await this.sceneRepository.findOne({
      where: { id: sceneId },
    });
    if (!scene) throw new AppError(404, "Scene not found");
    if (!scene.projectId) {
      throw new AppError(400, "Scene is not attached to a project.");
    }
    if (scene.sketchUrl) return scene;

    try {
      const imageBuffer = await this.generateOpenAIImageBuffer(
        `Storyboard sketch, black and white graphite pencil style, clean lines, professional 16:9 cinematic framing, English commercial storyboard context only: ${scene.aiPrompt || scene.scriptText}`,
      );

      const timestamp = Date.now();
      const s3Path = `projects/${scene.projectId}/sketches/${scene.id}/ai-${timestamp}.png`;
      const permanentUrl = await this.storageService.uploadBuffer(
        imageBuffer,
        s3Path,
        "image/png",
      );

      await this.recordSketch(scene, permanentUrl, SketchSource.AI);
    } catch (error) {
      console.error(`Failed to generate sketch for scene ${scene.id}:`, error);
      throw error;
    }

    return scene;
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

  async generateFinalImages(projectId: string, authHeader?: string): Promise<Scene[]> {
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
    const failedSceneErrors: string[] = [];

    for (const scene of scenes) {
      // OPTIMIZATION: Skip if already has an image
      if (scene.finalImageUrl) {
        updatedScenes.push(scene);
        continue;
      }

      // Use the helper function
      const updated = await this.processSceneImage(scene, actor, projectId, authHeader);
      if (updated) updatedScenes.push(updated);
      else failedSceneErrors.push(`Scene ${scene.sequenceOrder}`);
    }

    if (updatedScenes.length === 0) {
      throw new AppError(
        502,
        "Final image generation failed for every scene. RunPod needs final_input.json with the workflow parameter before realistic images can be created.",
      );
    }

    if (failedSceneErrors.length > 0) {
      console.warn(
        `Final image generation skipped/failed for: ${failedSceneErrors.join(", ")}`,
      );
    }

    project.status = "casting" as any;
    await this.projectRepository.save(project);

    return updatedScenes;
  }

  async generateSceneFinalImage(
    sceneId: string,
    authHeader?: string,
  ): Promise<Scene> {
    const scene = await this.sceneRepository.findOne({
      where: { id: sceneId },
      relations: ["project"],
    });

    if (!scene) throw new AppError(404, "Scene not found");
    if (scene.finalImageUrl) return scene;

    const project = scene.project;
    if (!project?.actorId) {
      throw new AppError(400, "Project has no actor assigned");
    }

    const actor = await this.actorService.getActorById(project.actorId);
    if (!actor) throw new AppError(404, "Actor not found");

    const updated = await this.processSceneImage(scene, actor, project.id, authHeader);
    if (!updated) throw new AppError(500, "Image generation failed");
    return updated;
  }

  // 2. NEW: Regenerate Single Scene
  async regenerateScene(
    sceneId: string,
    newPrompt?: string,
    authHeader?: string,
  ): Promise<Scene> {
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
    const updated = await this.processSceneImage(scene, actor, project.id, authHeader);

    if (!updated) throw new AppError(500, "Image generation failed");
    return updated;
  }

  // 3. PRIVATE HELPER (The shared logic)
  private async processSceneImage(
    scene: Scene,
    actor: any,
    projectId: string,
    authHeader?: string,
  ): Promise<Scene | null> {
    try {
      const imageBuffer = await this.createRunPodFinalImage(scene, actor, authHeader);

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
