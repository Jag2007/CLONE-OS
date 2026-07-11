import { Request, Response, NextFunction } from 'express';
import { ActorService } from '../services/actor.service';

export class ActorController {
  private actorService: ActorService;

  constructor() {
    this.actorService = new ActorService();
  }

  getAllActors = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const actors = await this.actorService.getAllActors();
      res.json({
        success: true,
        data: actors,
      });
    } catch (error) {
      next(error);
    }
  };

  getActorById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const actor = await this.actorService.getActorById(id);

      if (!actor) {
        res.status(404).json({
          success: false,
          error: 'Actor not found',
        });
        return;
      }

      res.json({
        success: true,
        data: actor,
      });
    } catch (error) {
      next(error);
    }
  };
}
