import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  GenerationLabMode,
} from '../entities/GenerationLabJob';
import { GenerationLabService } from '../services/generationLab.service';

const createJobSchema = z.object({
  mode: z.nativeEnum(GenerationLabMode),
  prompt: z.string().min(1, 'Prompt is required'),
  imageUrl: z.string().url().optional().or(z.literal('')),
  referenceImageUrls: z.array(z.string().url()).optional(),
  model: z.string().optional(),
  resolution: z.string().optional(),
  ratio: z.string().optional(),
  duration: z.number().optional(),
  size: z.string().optional(),
  count: z.number().optional(),
});

export class GenerationLabController {
  private generationLabService = new GenerationLabService();

  uploadInputImage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({
          success: false,
          error: 'No image uploaded. Use field name "image".',
        });
        return;
      }

      const data = await this.generationLabService.uploadInputImage(req.userId!, file);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  createJob = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createJobSchema.parse(req.body);
      const job = await this.generationLabService.createJob({
        ...validated,
        userId: req.userId!,
        imageUrl: validated.imageUrl || undefined,
      });

      res.status(202).json({
        success: true,
        data: job,
        message: job.status === 'SUCCEEDED' ? 'Generation completed' : 'Generation queued',
      });
    } catch (error) {
      next(error);
    }
  };

  listJobs = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const jobs = await this.generationLabService.listJobs(req.userId!);
      res.json({ success: true, data: jobs });
    } catch (error) {
      next(error);
    }
  };

  getJob = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const job = await this.generationLabService.getJob(req.userId!, req.params.id);
      res.json({ success: true, data: job });
    } catch (error) {
      next(error);
    }
  };
}
