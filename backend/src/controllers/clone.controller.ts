import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';

/** Credits required to start one clone training. */
const CLONE_CREDITS_COST = 100;

export class CloneController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Deduct credits for starting a clone training. Call this before calling the training service.
   * Returns 402 if insufficient credits.
   */
  startClone = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.userId!;
      const user = await this.userService.deductCredits(userId, CLONE_CREDITS_COST);
      res.json({
        success: true,
        message: 'Credits deducted for clone training',
        creditsDeducted: CLONE_CREDITS_COST,
        creditsBalance: user.creditsBalance,
      });
    } catch (error) {
      next(error);
    }
  };
}
