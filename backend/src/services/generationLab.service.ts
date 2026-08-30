import axios from 'axios';
import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { config } from '../config/env';
import {
  GenerationLabJob,
  GenerationLabMode,
  GenerationLabStatus,
} from '../entities/GenerationLabJob';
import { AppError } from '../middleware/errorHandler';
import { StorageService } from './storage.service';

type CreateGenerationLabJobInput = {
  userId: string;
  mode: GenerationLabMode;
  prompt: string;
  imageUrl?: string;
  referenceImageUrls?: string[];
  model?: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  size?: string;
  count?: number;
};

const DEFAULT_MODELS: Record<GenerationLabMode, string> = {
  [GenerationLabMode.I2V]: 'happyhorse-1.0-i2v',
  [GenerationLabMode.T2V]: 'happyhorse-1.0-t2v',
  [GenerationLabMode.IMAGE]: 'wan2.7-image-pro',
};

export class GenerationLabService {
  private jobRepository: Repository<GenerationLabJob>;
  private storageService: StorageService;

  constructor() {
    this.jobRepository = AppDataSource.getRepository(GenerationLabJob);
    this.storageService = new StorageService();
  }

  async uploadInputImage(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    const ext = this.getExtension(file.mimetype);
    const url = await this.storageService.uploadBuffer(
      file.buffer,
      `generation-lab/${userId}/inputs/${Date.now()}.${ext}`,
      file.mimetype,
    );

    return { url };
  }

  async createJob(input: CreateGenerationLabJobInput): Promise<GenerationLabJob> {
    this.assertConfigured();
    this.validateInput(input);

    const model = input.model || DEFAULT_MODELS[input.mode];
    const generation = this.jobRepository.create({
      userId: input.userId,
      mode: input.mode,
      prompt: input.prompt.trim(),
      model,
      status: GenerationLabStatus.PENDING,
      inputImageUrl: input.imageUrl || null,
      metadata: {
        resolution: input.resolution || '720P',
        ratio: input.ratio || '16:9',
        duration: this.resolveDuration(input.duration),
        size: input.size || '1280*720',
        count: input.count || 1,
        referenceImageUrls: input.referenceImageUrls || [],
      },
    });

    const saved = await this.jobRepository.save(generation);

    try {
      const { apiUrl, body, isSynchronousImage } = await this.buildRequest(input, model);
      const response = await axios.post(apiUrl, body, {
        headers: this.getDashScopeHeaders(!isSynchronousImage),
        timeout: 45000,
      });

      if (isSynchronousImage) {
        const resultUrl = this.extractImageUrl(response.data);
        if (!resultUrl) {
          throw new AppError(
            502,
            `Alan image response did not include an image URL: ${JSON.stringify(response.data)}`,
          );
        }

        saved.status = GenerationLabStatus.SUCCEEDED;
        saved.taskId = response.data?.request_id || 'sync';
        saved.resultUrl = resultUrl;
        await this.persistIfPossible(saved);
        return this.jobRepository.save(saved);
      }

      const taskId = response.data?.output?.task_id;
      if (!taskId) {
        throw new AppError(
          502,
          `Alan response did not include output.task_id: ${JSON.stringify(response.data)}`,
        );
      }

      saved.taskId = taskId;
      saved.status = GenerationLabStatus.PENDING;
      return this.jobRepository.save(saved);
    } catch (error: any) {
      saved.status = GenerationLabStatus.FAILED;
      saved.error = this.getErrorMessage(error);
      await this.jobRepository.save(saved);
      if (error instanceof AppError) throw error;
      throw new AppError(502, `Alan generation failed: ${saved.error}`);
    }
  }

  async listJobs(userId: string): Promise<GenerationLabJob[]> {
    const jobs = await this.jobRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return Promise.all(jobs.map((job) => this.refreshIfActive(job)));
  }

  async getJob(userId: string, id: string): Promise<GenerationLabJob> {
    const job = await this.jobRepository.findOne({ where: { id, userId } });
    if (!job) throw new AppError(404, 'Generation not found');
    return this.refreshIfActive(job);
  }

  private async refreshIfActive(job: GenerationLabJob): Promise<GenerationLabJob> {
    if (
      !job.taskId ||
      job.taskId === 'sync' ||
      ![GenerationLabStatus.PENDING, GenerationLabStatus.RUNNING].includes(job.status)
    ) {
      return job;
    }

    try {
      const response = await axios.get(this.getTaskUrl(job.taskId), {
        headers: this.getDashScopeHeaders(false),
        timeout: 30000,
      });
      const taskStatus = String(response.data?.output?.task_status || job.status).toUpperCase();

      if (taskStatus === 'SUCCEEDED') {
        job.status = GenerationLabStatus.SUCCEEDED;
        job.resultUrl =
          job.mode === GenerationLabMode.IMAGE
            ? this.extractImageUrl(response.data)
            : this.extractVideoUrl(response.data);
        await this.persistIfPossible(job);
      } else if (taskStatus === 'FAILED' || taskStatus === 'CANCELED' || taskStatus === 'CANCELLED') {
        job.status = GenerationLabStatus.FAILED;
        job.error = JSON.stringify(response.data?.output?.message || response.data?.message || response.data);
      } else if (taskStatus === 'RUNNING') {
        job.status = GenerationLabStatus.RUNNING;
      }

      return this.jobRepository.save(job);
    } catch (error: any) {
      job.error = this.getErrorMessage(error);
      return this.jobRepository.save(job);
    }
  }

  private async persistIfPossible(job: GenerationLabJob): Promise<void> {
    if (!job.resultUrl || job.storageUrl) return;

    try {
      const response = await axios.get(job.resultUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
      });
      const contentType =
        job.mode === GenerationLabMode.IMAGE ? 'image/png' : 'video/mp4';
      const ext = job.mode === GenerationLabMode.IMAGE ? 'png' : 'mp4';
      job.storageUrl = await this.storageService.uploadBuffer(
        Buffer.from(response.data as ArrayBuffer),
        `generation-lab/${job.userId}/outputs/${job.id}.${ext}`,
        contentType,
      );
    } catch (error) {
      console.warn(`Generation lab persist failed for ${job.id}:`, error);
    }
  }

  private async buildRequest(input: CreateGenerationLabJobInput, model: string) {
    if (input.mode === GenerationLabMode.I2V) {
      const publicImageUrl = await this.resolveWorkerImageUrl(input.imageUrl!);
      const isLegacy = model.startsWith('wan2.1-');
      return {
        apiUrl: config.workers.videoWorkerApiUrl,
        isSynchronousImage: false,
        body: {
          model,
          input: isLegacy
            ? {
                prompt: input.prompt,
                img_url: publicImageUrl,
              }
            : {
                prompt: input.prompt,
                media: [{ type: 'first_frame', url: publicImageUrl }],
              },
          parameters: {
            resolution: input.resolution || '720P',
            ...(isLegacy
              ? {}
              : {
                  ratio: input.ratio || '16:9',
                  duration: this.resolveDuration(input.duration),
                }),
          },
        },
      };
    }

    if (input.mode === GenerationLabMode.T2V) {
      const media = (input.referenceImageUrls || [])
        .filter((url) => /^https?:\/\//.test(url))
        .map((url) => ({ type: 'reference_image', url }));
      return {
        apiUrl: config.workers.videoWorkerApiUrl,
        isSynchronousImage: false,
        body: {
          model,
          input: {
            prompt: input.prompt,
            ...(media.length ? { media } : {}),
          },
          parameters: {
            resolution: input.resolution || '720P',
            ratio: input.ratio || '16:9',
            duration: this.resolveDuration(input.duration),
          },
        },
      };
    }

    const isQwen = model.startsWith('qwen-image');
    const imageUrl = input.imageUrl
      ? await this.resolveWorkerImageUrl(input.imageUrl)
      : null;
    return {
      apiUrl: this.getImageGenerationUrl(model),
      isSynchronousImage: isQwen,
      body: {
        model,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                ...(imageUrl ? [{ image: imageUrl }] : []),
                { text: input.prompt },
              ],
            },
          ],
        },
        parameters: isQwen
          ? {
              size: input.size || '1280*720',
              watermark: false,
              prompt_extend: true,
            }
          : {
              size: input.size || '1280*720',
              n: input.count || 1,
              watermark: false,
              thinking_mode: true,
            },
      },
    };
  }

  private async resolveWorkerImageUrl(url: string): Promise<string> {
    if (!url.includes('localhost') && !url.includes('127.0.0.1')) return url;
    if (!config.workers.videoImageHostApiKey) {
      throw new AppError(
        400,
        'A public image URL is required, or VIDEO_IMAGE_HOST_API_KEY must be configured for local uploads.',
      );
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });
    const formData = new URLSearchParams();
    formData.append('source', Buffer.from(response.data as ArrayBuffer).toString('base64'));
    formData.append('action', 'upload');

    const uploadResponse = await axios.post(
      `${config.workers.videoImageHostApiUrl}?key=${config.workers.videoImageHostApiKey}`,
      formData,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 120000,
      },
    );
    const uploadedUrl = uploadResponse.data?.image?.url;
    if (!uploadedUrl) {
      throw new AppError(
        502,
        `Image host upload failed: ${JSON.stringify(uploadResponse.data)}`,
      );
    }

    return uploadedUrl;
  }

  private getImageGenerationUrl(model: string): string {
    const generateUrl = new URL(config.workers.videoWorkerApiUrl);
    generateUrl.pathname = model.startsWith('qwen-image')
      ? '/api/v1/services/aigc/multimodal-generation/generation'
      : '/api/v1/services/aigc/image-generation/generation';
    return generateUrl.toString();
  }

  private getTaskUrl(taskId: string): string {
    if (config.workers.videoTaskBaseUrl) {
      return `${config.workers.videoTaskBaseUrl}/${taskId}`;
    }

    const generateUrl = new URL(config.workers.videoWorkerApiUrl);
    return new URL(`/api/v1/tasks/${taskId}`, generateUrl.origin).toString();
  }

  private getDashScopeHeaders(asyncRequest: boolean): Record<string, string> {
    if (!config.workers.videoApiKey) {
      throw new AppError(400, 'VIDEO_API_KEY is missing in backend/.env.');
    }

    const authScheme = config.workers.videoAuthScheme.trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: authScheme
        ? `${authScheme} ${config.workers.videoApiKey}`
        : config.workers.videoApiKey,
    };

    if (asyncRequest) {
      headers[config.workers.videoAsyncHeaderName] = config.workers.videoAsyncHeaderValue;
    }

    return headers;
  }

  private validateInput(input: CreateGenerationLabJobInput): void {
    if (!input.prompt?.trim()) {
      throw new AppError(400, 'Prompt is required.');
    }

    if (input.mode === GenerationLabMode.I2V && !input.imageUrl) {
      throw new AppError(400, 'Image to Video requires an image URL or uploaded image.');
    }
  }

  private resolveDuration(duration?: number): number {
    if (!Number.isFinite(duration) || !duration) return 5;
    return Math.min(15, Math.max(5, Math.round(duration)));
  }

  private getExtension(mime: string): string {
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'png';
  }

  private extractVideoUrl(data: any): string | null {
    return (
      data?.output?.video_url ||
      data?.output?.results?.[0]?.url ||
      data?.video_url ||
      null
    );
  }

  private extractImageUrl(data: any): string | null {
    const choices = data?.output?.choices || [];
    for (const choice of choices) {
      const content = choice?.message?.content || [];
      for (const item of content) {
        if (item?.image) return item.image;
      }
    }

    return (
      data?.output?.results?.[0]?.url ||
      data?.output?.images?.[0]?.url ||
      data?.image_url ||
      null
    );
  }

  private getErrorMessage(error: any): string {
    return (
      error?.response?.data?.message ||
      error?.response?.data?.output?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Unknown error'
    );
  }

  private assertConfigured(): void {
    if (!config.workers.videoWorkerApiUrl) {
      throw new AppError(400, 'VIDEO_WORKER_API_URL is missing in backend/.env.');
    }
  }
}
