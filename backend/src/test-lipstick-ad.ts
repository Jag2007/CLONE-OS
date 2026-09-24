import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import axios from "axios";
import sharp from "sharp";
import { OpenAI } from "openai";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Setup config matching backend/src/config/env.ts
const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
  },
  workers: {
    videoWorkerApiUrl: process.env.VIDEO_WORKER_API_URL || "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    videoApiKey: process.env.VIDEO_API_KEY || "",
    videoAuthScheme: process.env.VIDEO_AUTH_SCHEME || "Bearer",
    videoImageField: process.env.VIDEO_IMAGE_FIELD || "image",
    videoPromptField: process.env.VIDEO_PROMPT_FIELD || "prompt",
    videoDurationField: process.env.VIDEO_DURATION_FIELD || "duration",
    videoDuration: process.env.VIDEO_DURATION || "5",
    videoOutputField: process.env.VIDEO_OUTPUT_FIELD || "video_url",
    videoTaskIdField: process.env.VIDEO_TASK_ID_FIELD || "output.task_id",
    videoTaskStatusField: process.env.VIDEO_TASK_STATUS_FIELD || "output.task_status",
    videoTaskBaseUrl: process.env.VIDEO_TASK_BASE_URL || "https://dashscope-intl.aliyuncs.com/api/v1/tasks",
    videoAsyncHeaderName: process.env.VIDEO_ASYNC_HEADER_NAME || "X-DashScope-Async",
    videoAsyncHeaderValue: process.env.VIDEO_ASYNC_HEADER_VALUE || "enable",
    videoImageHostApiUrl: process.env.VIDEO_IMAGE_HOST_API_URL || "https://freeimage.host/api/1/upload",
    videoImageHostApiKey: process.env.VIDEO_IMAGE_HOST_KEY || process.env.VIDEO_IMAGE_HOST_API_KEY || "",
    videoImageHostOutputField: process.env.VIDEO_IMAGE_HOST_OUTPUT_FIELD || "image.url",
    videoModel: process.env.VIDEO_MODEL || "happyhorse-1.0-i2v",
    videoResolution: process.env.VIDEO_RESOLUTION || "720P",
    videoRatio: process.env.VIDEO_RATIO || "16:9",
    runpodApiKey: process.env.RUNPOD_API_KEY || "",
    runpodAuthScheme: process.env.RUNPOD_AUTH_SCHEME || "",
    runpodEndpointId: process.env.RUNPOD_ENDPOINT_ID || "",
    runpodBaseUrl: process.env.RUNPOD_BASE_URL || "https://api.runpod.ai/v2",
    runpodImageEndpointId: process.env.RUNPOD_IMAGE_ENDPOINT_ID || process.env.RUNPOD_ENDPOINT_ID || "",
    runpodImageInputTemplatePath: process.env.RUNPOD_IMAGE_INPUT_TEMPLATE_PATH || "runpod/final_input.json",
    runpodImageWidth: parseInt(process.env.RUNPOD_IMAGE_WIDTH || "1280", 10),
    runpodImageHeight: parseInt(process.env.RUNPOD_IMAGE_HEIGHT || "720", 10),
    runpodImageOutputField: process.env.RUNPOD_IMAGE_OUTPUT_FIELD || "images.0.data",
    runpodPollIntervalMs: parseInt(process.env.RUNPOD_POLL_INTERVAL_MS || "5000", 10),
    runpodMaxPollAttempts: parseInt(process.env.RUNPOD_MAX_POLL_ATTEMPTS || "120", 10),
    runpodExecutionTimeoutMs: parseInt(process.env.RUNPOD_EXECUTION_TIMEOUT_MS || "900000", 10),
  }
};

const BACKEND_ROOT = path.resolve(__dirname, "..");
const testOutputDir = path.resolve(BACKEND_ROOT, "test_output");

// Helpers
function getValueByPath(source: any, path: string): any {
  return path.split(".").reduce((current, part) => {
    if (current == null) return undefined;
    if (/^\d+$/.test(part) && Array.isArray(current)) {
      return current[Number(part)];
    }
    if (typeof current === "object") {
      return current[part];
    }
    return undefined;
  }, source);
}

function extractVideoUrl(output: any): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = extractVideoUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (typeof output === "object") {
    const configuredValue = getValueByPath(output, config.workers.videoOutputField);
    if (configuredValue && typeof configuredValue === "string") return configuredValue;
    for (const value of Object.values(output)) {
      const url = extractVideoUrl(value);
      if (url) return url;
    }
  }
  return null;
}

function extractBase64Image(output: any): string | null {
  if (!output) return null;
  if (typeof output === "string") {
    if (output.startsWith("data:image/")) {
      return output.split(",", 2)[1] || null;
    }
    return output;
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const data = extractBase64Image(item);
      if (data) return data;
    }
    return null;
  }
  if (typeof output === "object") {
    const configuredValue = getValueByPath(output, config.workers.runpodImageOutputField);
    if (configuredValue && typeof configuredValue === "string") return configuredValue;
    for (const value of Object.values(output)) {
      const data = extractBase64Image(value);
      if (data) return data;
    }
  }
  return null;
}

function buildMultipart(parts: Array<{
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

async function uploadImageForWan(imageBuffer: Buffer): Promise<string> {
  const filename = "scene.jpg";
  const contentType = "image/jpeg";

  // Resize and compress
  const processedBuffer = await sharp(imageBuffer)
    .rotate()
    .resize({
      width: 1280,
      height: 720,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  if (!config.workers.videoImageHostApiKey) {
    throw new Error("VIDEO_IMAGE_HOST_API_KEY is missing. It is required to host the image for Happy Horse.");
  }

  const { boundary, body } = buildMultipart([
    { name: "key", value: config.workers.videoImageHostApiKey },
    { name: "format", value: "json" },
    {
      name: "source",
      filename,
      contentType,
      data: processedBuffer,
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

  const hostedUrl = getValueByPath(
    uploadResponse.data,
    config.workers.videoImageHostOutputField,
  );

  if (typeof hostedUrl === "string" && hostedUrl) {
    return hostedUrl;
  }

  throw new Error(`Image host upload failed before video generation: ${JSON.stringify(uploadResponse.data)}`);
}

async function main() {
  const timestamp = Date.now();
  const outputDirName = `lipstick_ad_${timestamp}`;
  const outDir = path.join(testOutputDir, outputDirName);
  await fs.mkdir(outDir, { recursive: true });

  console.log(`Starting Lipstick Ad Test Run...`);
  console.log(`Saving all outputs to: ${outDir}`);

  const openai = new OpenAI({ apiKey: config.openai.apiKey, timeout: 15000 });

  // 1. Generate Storyboard Script using OpenAI
  console.log("\n[Step 1/5] Generating script and prompts from OpenAI...");
  const scriptPrompt = "Create a luxury matte red lipstick commercial. Focus on bold crimson shades, premium glass containers, and application on lips.";
  const sceneCount = 3;

  let scenes: any[] = [];
  try {
    const scriptCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a professional video director and expert cinematographer. Break the user's request into exactly ${sceneCount} distinct scenes for a 15-second commercial. Each scene should represent about 5 seconds of screen time.
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
[SHOT TYPE], [MISE-EN-SCÈNE], [SUBJECT & ACTION], [ENVIRONMENT & SETTING], [LIGHTING SETUP], [LENS & DEPTH OF FIELD], [CAMERA ANGLE & MOVEMENT], [FOCUS POINT & PULLING], [COLOR GRADE & FILM LOOK], [MOOD & ATMOSPHERE], [ASPECT RATIO], [TECHNICAL REFERENCE]`
        },
        {
          role: "user",
          content: `Create exactly ${sceneCount} English storyboard scenes for this 15-second 16:9 commercial: ${scriptPrompt}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const scriptContent = scriptCompletion.choices[0]?.message?.content;
    if (!scriptContent) {
      throw new Error("Failed to generate script content from OpenAI");
    }

    const parsedScript = JSON.parse(scriptContent);
    scenes = parsedScript.scenes || [];
    console.log(`Successfully generated ${scenes.length} scenes from OpenAI.`);
  } catch (err: any) {
    console.warn(`[WARN] OpenAI Script generation failed: ${err.message}. Falling back to pre-defined luxury lipstick commercial storyboard.`);
    scenes = [
      {
        sequenceOrder: 1,
        scriptText: "Introducing the new Velvet Crimson matte lipstick. Pure elegance in a glass vial.",
        aiPrompt: "Close up shot, a sleek luxury glass lipstick container with a golden cap, resting on a reflective black marble surface, dramatic low-key lighting, shallow depth of field, sharp focus on the brand logo, rich cinematic look, 16:9, ARRI Alexa 65"
      },
      {
        sequenceOrder: 2,
        scriptText: "Unapologetically bold. Velvet-smooth application in one single swipe.",
        aiPrompt: "Extreme close up shot of a beautiful model's lips, slowly applying a rich matte red lipstick, soft rim lighting, macro lens with very shallow depth of field, warm color grade, sensual and premium mood, 16:9, RED Monstro"
      },
      {
        sequenceOrder: 3,
        scriptText: "Velvet Crimson. Own your shine, matte your lips.",
        aiPrompt: "Medium close up shot of the model smiling confidently at the camera, wearing the vibrant crimson lipstick, studio environment with dark velvet background, soft Rembrandt lighting, 85mm lens, gold and red color accents, 16:9, Sony Venice"
      }
    ];
  }

  await fs.writeFile(path.join(outDir, "prompts.json"), JSON.stringify(scenes, null, 2), "utf8");

  // 2. Generate Storyboard Sketches using OpenAI
  console.log("\n[Step 2/5] Generating storyboard sketches using OpenAI...");
  const sketchBuffers: Buffer[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    console.log(`Scene ${scene.sequenceOrder} - Generating sketch...`);
    const prompt = `Storyboard sketch, black and white graphite pencil style, clean lines, professional 16:9 cinematic framing, English commercial storyboard context only: ${scene.aiPrompt || scene.scriptText}`;
    
    let buffer: Buffer | null = null;
    try {
      // Try with configured model first
      const imageResponse = await openai.images.generate({
        model: config.openai.imageModel,
        prompt,
        n: 1,
        size: "1024x1024",
      });
      const imageUrl = imageResponse.data?.[0]?.url || "";
      const downloadResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
      buffer = Buffer.from(downloadResponse.data);
    } catch (err: any) {
      console.warn(`[WARN] OpenAI image generation failed using model ${config.openai.imageModel}: ${err.message}.`);
      try {
        console.log(`Trying to fall back to dall-e-3...`);
        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1024",
        });
        const imageUrl = imageResponse.data?.[0]?.url || "";
        const downloadResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
        buffer = Buffer.from(downloadResponse.data);
      } catch (fallbackErr: any) {
        console.warn(`[WARN] DALL-E 3 fallback also failed: ${fallbackErr.message}. Loading local reference sketch as fallback...`);
        // Find existing sketch under test_output/test_output
        const refSketchPath = path.join(testOutputDir, "test_output", `scene_${((scene.sequenceOrder - 1) % 6) + 1}`, "sketch.png");
        try {
          buffer = await fs.readFile(refSketchPath);
          console.log(`Successfully loaded reference sketch from ${refSketchPath}`);
        } catch (fileErr: any) {
          console.warn(`[WARN] Could not read reference sketch file: ${fileErr.message}. Generating a blank canvas placeholder...`);
          buffer = await sharp({
            create: {
              width: 1024,
              height: 1024,
              channels: 3,
              background: { r: 200, g: 200, b: 200 }
            }
          }).png().toBuffer();
        }
      }
    }

    const sceneDir = path.join(outDir, `scene_${scene.sequenceOrder}`);
    await fs.mkdir(sceneDir, { recursive: true });
    
    const sketchPath = path.join(sceneDir, "sketch.png");
    await fs.writeFile(sketchPath, buffer);
    sketchBuffers.push(buffer);
    console.log(`Saved sketch to ${sketchPath}`);
  }

  // 3. Generate Photorealistic Images using RunPod
  console.log("\n[Step 3/5] Generating photorealistic final images using RunPod...");
  const realisticBuffers: Buffer[] = [];
  const triggerWord = "Emma"; // Using Emma as standard actor

  // Load final_input.json template
  const templatePath = path.isAbsolute(config.workers.runpodImageInputTemplatePath)
    ? config.workers.runpodImageInputTemplatePath
    : path.resolve(BACKEND_ROOT, config.workers.runpodImageInputTemplatePath);
  const rawTemplate = await fs.readFile(templatePath, "utf8");

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    console.log(`Scene ${scene.sequenceOrder} - Generating realistic image via RunPod...`);
    const sketchBase64 = sketchBuffers[i].toString("base64");
    const basePrompt = scene.aiPrompt || scene.scriptText || "";
    const fullPrompt = `full body shot of ${triggerWord}, ${basePrompt}, photorealistic, cinematic lighting, 16:9`;

    // Process ComfyUI template variables
    const template = JSON.parse(rawTemplate);
    const replacements: Record<string, string> = {
      "{{SKETCH_BASE64}}": sketchBase64,
      "{{PROMPT}}": fullPrompt,
      "{{TRIGGER_WORD}}": triggerWord,
      "{{LORA_NAME}}": "",
      "{{LORA_URL}}": "",
      "{{WIDTH}}": String(config.workers.runpodImageWidth),
      "{{HEIGHT}}": String(config.workers.runpodImageHeight),
    };

    const replaceTemplateVariables = (value: any): any => {
      if (typeof value === "string") {
        return Object.entries(replacements).reduce(
          (result, [token, replacement]) => result.split(token).join(replacement),
          value,
        );
      }
      if (Array.isArray(value)) {
        return value.map((item) => replaceTemplateVariables(item));
      }
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, replaceTemplateVariables(item)]),
        );
      }
      return value;
    };

    const payload = replaceTemplateVariables(template);

    // Override specific workflow nodes if present
    const input = payload.input;
    const workflow = input?.workflow;
    if (workflow && typeof workflow === "object") {
      if (workflow["19"]?.inputs) {
        workflow["19"].inputs.value = fullPrompt;
      }
      if (workflow["21"]?.inputs) {
        workflow["21"].inputs.image = "image.png";
      }
    }
    if (input && Array.isArray(input.images)) {
      input.images[0] = {
        ...(input.images[0] || {}),
        name: "image.png",
        image: sketchBase64,
      };
    }

    // Call RunPod API
    if (!config.workers.runpodApiKey || !config.workers.runpodImageEndpointId) {
      throw new Error("RUNPOD_API_KEY or RUNPOD_IMAGE_ENDPOINT_ID is missing in env.");
    }

    const runpodHeaders = {
      Authorization: config.workers.videoAuthScheme
        ? `${config.workers.videoAuthScheme} ${config.workers.runpodApiKey}`
        : config.workers.runpodApiKey,
      "Content-Type": "application/json",
    };

    const runpodUrl = `${config.workers.runpodBaseUrl}/${config.workers.runpodImageEndpointId}/runsync`;
    console.log(`Submitting RunSync job to RunPod: ${runpodUrl}`);
    const runpodRes = await axios.post(runpodUrl, JSON.stringify(payload), {
      headers: runpodHeaders,
      timeout: config.workers.runpodExecutionTimeoutMs,
    });

    let job = runpodRes.data;
    const jobId = job.id || job.jobId;
    console.log(`RunPod Job ID: ${jobId}, Status: ${job.status}`);

    if (job.status?.toUpperCase() !== "COMPLETED" && !job.output) {
      // Poll
      const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);
      let completed = false;

      for (let attempt = 0; attempt < config.workers.runpodMaxPollAttempts; attempt++) {
        await new Promise((res) => setTimeout(res, config.workers.runpodPollIntervalMs));
        const statusUrl = `${config.workers.runpodBaseUrl}/${config.workers.runpodImageEndpointId}/status/${jobId}`;
        const pollRes = await axios.get(statusUrl, { headers: runpodHeaders, timeout: 30000 });
        job = pollRes.data;
        const currentStatus = job.status?.toUpperCase();
        console.log(`RunPod Poll Attempt ${attempt + 1}: Status = ${currentStatus}`);

        if (currentStatus === "COMPLETED") {
          completed = true;
          break;
        }
        if (terminalStatuses.has(currentStatus)) {
          throw new Error(`RunPod generation failed with terminal status: ${currentStatus}. Error: ${JSON.stringify(job.error)}`);
        }
      }

      if (!completed) {
        throw new Error("RunPod job polling timed out.");
      }
    }

    const base64Data = extractBase64Image(job.output);
    if (!base64Data) {
      throw new Error(`RunPod completed but did not return base64 image data: ${JSON.stringify(job.output)}`);
    }

    const realisticBuffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const sceneDir = path.join(outDir, `scene_${scene.sequenceOrder}`);
    const realisticPath = path.join(sceneDir, "realistic.png");
    await fs.writeFile(realisticPath, realisticBuffer);
    realisticBuffers.push(realisticBuffer);
    console.log(`Saved photorealistic image to ${realisticPath}`);
  }

  // 4. Generate Video Motion Prompts using OpenAI
  console.log("\n[Step 4/5] Generating motion prompts and video clips using Happy Horse...");
  console.log("Generating motion prompts via OpenAI...");
  const motionData = scenes.map((s: any) => ({
    sequenceOrder: s.sequenceOrder,
    scriptText: s.scriptText,
    aiPrompt: s.aiPrompt || ""
  }));

  let motionPrompts: string[] = [];
  try {
    const motionCompletion = await openai.chat.completions.create({
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
          content: `Scenes Sequence:\n${JSON.stringify(motionData, null, 2)}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const motionContent = motionCompletion.choices[0]?.message?.content;
    if (!motionContent) {
      throw new Error("No motion response content from OpenAI");
    }
    const parsedMotion = JSON.parse(motionContent);
    motionPrompts = parsedMotion.motionPrompts || [];
    console.log("Generated Motion Prompts from OpenAI:", motionPrompts);
  } catch (err: any) {
    console.warn(`[WARN] OpenAI Motion prompts generation failed: ${err.message}. Falling back to default lipstick commercial motion descriptions.`);
    motionPrompts = [
      "Camera slowly pushes in as a matte red lipstick in a glass container glows under soft lighting.",
      "Extreme close-up macro tracking shot of velvet lipstick being glided smoothly across lips.",
      "The model smiles gracefully, turning her head slightly in slow motion, hair floating gently."
    ];
  }

  await fs.writeFile(path.join(outDir, "optimized_motion_prompts.json"), JSON.stringify(motionPrompts, null, 2), "utf8");

  // Generate Video Clips via Happy Horse (DashScope)
  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const motionPrompt = motionPrompts[i] || scene.scriptText;
    console.log(`\nScene ${scene.sequenceOrder} - Hosting image on freeimage.host...`);
    
    // Upload image to host to get public URL
    const publicUrl = await uploadImageForWan(realisticBuffers[i]);
    console.log(`Hosted Image URL: ${publicUrl}`);

    // Create Happy Horse input payload
    const duration = 5;
    const model = config.workers.videoModel; // happyhorse-1.0-i2v
    const isLegacy = model.startsWith("wan2.1-");
    
    const input: Record<string, any> = {
      [config.workers.videoPromptField]: motionPrompt,
    };

    if (isLegacy) {
      input.img_url = publicUrl;
    } else {
      input.media = [{ type: "first_frame", url: publicUrl }];
    }

    const payload = {
      model,
      input,
      parameters: {
        resolution: config.workers.videoResolution,
        ...(isLegacy
          ? {}
          : {
              ratio: config.workers.videoRatio,
              [config.workers.videoDurationField]: duration,
            }),
      },
    };

    // Call video synthesis endpoint
    console.log(`Submitting video task to Happy Horse: ${config.workers.videoWorkerApiUrl}`);
    const authHeaders = config.workers.videoApiKey ? {
      Authorization: config.workers.videoAuthScheme
        ? `${config.workers.videoAuthScheme} ${config.workers.videoApiKey}`
        : config.workers.videoApiKey,
    } : {};

    const videoResponse = await axios.post(
      config.workers.videoWorkerApiUrl,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          ...(config.workers.videoAsyncHeaderName && config.workers.videoAsyncHeaderValue
            ? { [config.workers.videoAsyncHeaderName]: config.workers.videoAsyncHeaderValue }
            : {}),
          ...authHeaders,
        },
        timeout: 900000,
      }
    );

    const taskId = getValueByPath(videoResponse.data, config.workers.videoTaskIdField);
    if (!taskId) {
      throw new Error(`Happy Horse submission failed: ${JSON.stringify(videoResponse.data)}`);
    }
    console.log(`DashScope Video Task ID: ${taskId}`);

    // Poll DashScope video task status
    const taskUrl = `${config.workers.videoTaskBaseUrl}/${taskId}`;
    console.log(`Polling Video Task status at ${taskUrl}...`);
    let videoUrl = "";

    for (let attempt = 0; attempt < config.workers.runpodMaxPollAttempts; attempt++) {
      await new Promise((res) => setTimeout(res, config.workers.runpodPollIntervalMs));
      
      const pollResponse = await axios.get(taskUrl, {
        headers: authHeaders,
        timeout: 30000,
      });
      const status = String(
        getValueByPath(pollResponse.data, config.workers.videoTaskStatusField) || ""
      ).toUpperCase();
      console.log(`DashScope Video Poll Attempt ${attempt + 1}: Status = ${status}`);

      if (status === "SUCCEEDED") {
        const configuredValue = getValueByPath(pollResponse.data, config.workers.videoOutputField);
        const configuredUrl = extractVideoUrl(configuredValue);
        const fallbackUrl = extractVideoUrl(pollResponse.data);
        videoUrl = configuredUrl || fallbackUrl || "";
        break;
      }

      if (status === "FAILED" || status === "CANCELED" || status === "CANCELLED") {
        throw new Error(`Happy Horse video task failed with status ${status}: ${JSON.stringify(pollResponse.data)}`);
      }
    }

    if (!videoUrl) {
      throw new Error("Happy Horse video generation timed out or failed to return URL.");
    }

    console.log(`Generated Video Clip URL: ${videoUrl}`);

    // Download clip
    console.log(`Downloading video clip...`);
    const downloadRes = await axios.get(videoUrl, { responseType: "arraybuffer", timeout: 300000 });
    const clipBuffer = Buffer.from(downloadRes.data);
    
    const sceneDir = path.join(outDir, `scene_${scene.sequenceOrder}`);
    const clipPath = path.join(sceneDir, "clip.mp4");
    await fs.writeFile(clipPath, clipBuffer);
    clipPaths.push(clipPath);
    console.log(`Saved video clip to ${clipPath}`);
  }

  // 5. Stitch Video Clips using local ffmpeg
  console.log("\n[Step 5/5] Stitching video clips using local ffmpeg...");
  const listPath = path.join(outDir, "clips.txt");
  
  // Format for ffmpeg concat filter: paths must use forward slashes or escape backslashes on Windows
  const listContent = clipPaths.map((clipPath) => `file '${clipPath.replace(/\\/g, "/")}'`).join("\n");
  await fs.writeFile(listPath, listContent, "utf8");
  console.log(`Clips list file saved to ${listPath}`);

  const outputPath = path.join(outDir, "final_stitched_video.mp4");
  console.log(`Running ffmpeg concat...`);
  
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

  console.log(`\n======================================================`);
  console.log(`Success! All generation steps complete.`);
  console.log(`Final output files saved in folder:`);
  console.log(`${outDir}`);
  console.log(`======================================================`);
}

main().catch((error) => {
  console.error("Test lipstick ad run failed:", error);
  process.exit(1);
});
