import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const userEmail = req.user.email.toLowerCase();
  const isAdmin = req.user.role === 'admin' || config.adminEmails.includes(userEmail);

  if (!isAdmin) {
    res.status(403).json({ success: false, message: 'Access denied: Admin privileges required' });
    return;
  }

  next();
};
