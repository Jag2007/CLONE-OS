import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { FeedbackService } from '../services/feedback.service';
import {
  FeedbackImageType,
  FeedbackRating,
} from '../entities/Feedback';

const submitFeedbackSchema = z.object({
  imageType: z.nativeEnum(FeedbackImageType),
  rating: z.nativeEnum(FeedbackRating),
  comment: z.string().max(2000).optional(),
});

export class FeedbackController {
  private feedbackService: FeedbackService;

  constructor() {
    this.feedbackService = new FeedbackService();
  }

  submitFeedback = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { sceneId } = req.params;
      const userId = req.userId!;
      const validated = submitFeedbackSchema.parse(req.body);

      const feedback = await this.feedbackService.submitFeedback(
        userId,
        sceneId,
        validated,
      );

      res.status(200).json({
        success: true,
        data: feedback,
        message: 'Feedback saved successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getProjectFeedback = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const userId = req.userId!;

      const feedback = await this.feedbackService.getFeedbackForProject(
        projectId,
        userId,
      );

      res.status(200).json({
        success: true,
        data: feedback,
      });
    } catch (error) {
      next(error);
    }
  };
}
