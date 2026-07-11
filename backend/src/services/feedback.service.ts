import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  Feedback,
  FeedbackImageType,
  FeedbackRating,
} from '../entities/Feedback';
import { Scene } from '../entities/Scene';
import { Project } from '../entities/Project';

interface SubmitFeedbackInput {
  imageType: FeedbackImageType;
  rating: FeedbackRating;
  comment?: string;
}

export class FeedbackService {
  private feedbackRepository: Repository<Feedback>;
  private sceneRepository: Repository<Scene>;
  private projectRepository: Repository<Project>;

  constructor() {
    this.feedbackRepository = AppDataSource.getRepository(Feedback);
    this.sceneRepository = AppDataSource.getRepository(Scene);
    this.projectRepository = AppDataSource.getRepository(Project);
  }

  async submitFeedback(
    userId: string,
    sceneId: string,
    input: SubmitFeedbackInput,
  ): Promise<Feedback> {
    // 1. Load scene with its project so we can check ownership
    const scene = await this.sceneRepository.findOne({
      where: { id: sceneId },
      relations: ['project', 'project.user'],
    });

    if (!scene) throw new AppError(404, 'Scene not found');
    if (!scene.project) throw new AppError(404, 'Scene has no parent project');

    // 2. Ownership check — only the project owner can leave feedback
    if (!scene.project.user || scene.project.user.id !== userId) {
      throw new AppError(
        403,
        'Access denied: only the project owner can leave feedback',
      );
    }

    // 3. Ensure the image actually exists on the scene
    if (
      input.imageType === FeedbackImageType.SKETCH &&
      !scene.sketchUrl
    ) {
      throw new AppError(
        400,
        'Cannot leave feedback on a sketch that has not been generated or uploaded yet',
      );
    }
    if (
      input.imageType === FeedbackImageType.FINAL &&
      !scene.finalImageUrl
    ) {
      throw new AppError(
        400,
        'Cannot leave feedback on a final image that has not been generated yet',
      );
    }

    // 4. Upsert: one feedback per user per scene per image type
    const existing = await this.feedbackRepository.findOne({
      where: {
        sceneId,
        userId,
        imageType: input.imageType,
      },
    });

    if (existing) {
      existing.rating = input.rating;
      existing.comment = input.comment ?? null;
      return this.feedbackRepository.save(existing);
    }

    const feedback = this.feedbackRepository.create({
      sceneId,
      userId,
      imageType: input.imageType,
      rating: input.rating,
      comment: input.comment ?? null,
    });
    return this.feedbackRepository.save(feedback);
  }

  async getFeedbackForProject(
    projectId: string,
    userId: string,
  ): Promise<Feedback[]> {
    // Ownership check
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['user'],
    });
    if (!project) throw new AppError(404, 'Project not found');
    if (!project.user || project.user.id !== userId) {
      throw new AppError(
        403,
        'Access denied: Project does not belong to user',
      );
    }

    // Join feedback -> scene filtered by project
    return this.feedbackRepository
      .createQueryBuilder('feedback')
      .innerJoinAndSelect('feedback.scene', 'scene')
      .where('scene.project_id = :projectId', { projectId })
      .orderBy('scene.sequence_order', 'ASC')
      .addOrderBy('feedback.created_at', 'ASC')
      .getMany();
  }
}
