import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { Project } from '../entities/Project';

export class AdminController {
  private userRepository = AppDataSource.getRepository(User);
  private projectRepository = AppDataSource.getRepository(Project);

  getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await this.userRepository.find({
        order: { createdAt: 'DESC' },
        select: ['id', 'email', 'creditsBalance', 'plan', 'role', 'createdAt', 'updatedAt'],
      });
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  };

  updateUserCredits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { amount, mode } = req.body; // mode: 'add' | 'set'

      if (typeof amount !== 'number') {
        res.status(400).json({ success: false, message: 'Invalid amount provided' });
        return;
      }

      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      if (mode === 'set') {
        user.creditsBalance = Math.max(0, Math.floor(amount));
      } else {
        // default 'add'
        user.creditsBalance = Math.max(0, user.creditsBalance + Math.floor(amount));
      }

      await this.userRepository.save(user);

      res.json({
        success: true,
        message: `Credits updated for ${user.email}. New balance: ${user.creditsBalance}`,
        data: {
          id: user.id,
          email: user.email,
          creditsBalance: user.creditsBalance,
          plan: user.plan,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  updateUserPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { plan } = req.body; // 'free' | 'pro'

      if (plan !== 'free' && plan !== 'pro') {
        res.status(400).json({ success: false, message: 'Plan must be either "free" or "pro"' });
        return;
      }

      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      user.plan = plan;
      await this.userRepository.save(user);

      res.json({
        success: true,
        message: `Plan updated to ${plan.toUpperCase()} for ${user.email}`,
        data: {
          id: user.id,
          email: user.email,
          creditsBalance: user.creditsBalance,
          plan: user.plan,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  updateUserRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { role } = req.body; // 'user' | 'admin'

      if (role !== 'user' && role !== 'admin') {
        res.status(400).json({ success: false, message: 'Role must be either "user" or "admin"' });
        return;
      }

      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      user.role = role;
      await this.userRepository.save(user);

      res.json({
        success: true,
        message: `Role updated to ${role} for ${user.email}`,
        data: {
          id: user.id,
          email: user.email,
          creditsBalance: user.creditsBalance,
          plan: user.plan,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const totalUsers = await this.userRepository.count();
      const totalProjects = await this.projectRepository.count();
      const users = await this.userRepository.find({ select: ['creditsBalance', 'plan'] });
      
      const totalCredits = users.reduce((acc, u) => acc + (u.creditsBalance || 0), 0);
      const proUsersCount = users.filter((u) => u.plan === 'pro').length;
      const freeUsersCount = users.filter((u) => u.plan === 'free').length;

      res.json({
        success: true,
        data: {
          totalUsers,
          totalProjects,
          totalCredits,
          proUsersCount,
          freeUsersCount,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}
