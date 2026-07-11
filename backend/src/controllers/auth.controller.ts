// src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';

const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string(),
});

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  signup = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = signupSchema.parse(req.body);
      const { user, token } = await this.authService.signup(
        validated.email,
        validated.password
      );

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            creditsBalance: user.creditsBalance,
          },
          token,
        },
        message: 'User registered successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = loginSchema.parse(req.body);
      const { user, token } = await this.authService.login(
        validated.email,
        validated.password
      );

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            creditsBalance: user.creditsBalance,
          },
          token,
        },
        message: 'Login successful',
      });
    } catch (error) {
      next(error);
    }
  };

  getProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = req.user!;

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          creditsBalance: user.creditsBalance,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}