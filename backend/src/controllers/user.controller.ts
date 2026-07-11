import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserService } from '../services/user.service';

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  initialCredits: z.number().int().positive().optional(),
});

const addCreditsSchema = z.object({
  amount: z.number().int().positive('Amount must be a positive integer'),
});

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  createUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = createUserSchema.parse(req.body);
      const user = await this.userService.createUser(
        validated.email,
        validated.initialCredits
      );

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          creditsBalance: user.creditsBalance,
        },
        message: 'User created successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getCurrentUser = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const user = req.user!;
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        creditsBalance: user.creditsBalance,
      },
    });
  };

  getCredits = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.userId!;
      const credits = await this.userService.getUserCredits(userId);

      res.json({
        success: true,
        data: { credits },
      });
    } catch (error) {
      next(error);
    }
  };

  addCredits = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.userId!;
      const validated = addCreditsSchema.parse(req.body);
      const user = await this.userService.addCredits(userId, validated.amount);

      res.json({
        success: true,
        data: {
          creditsBalance: user.creditsBalance,
        },
        message: `Added ${validated.amount} credits successfully`,
      });
    } catch (error) {
      next(error);
    }
  };
}