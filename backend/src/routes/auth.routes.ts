// src/routes/auth.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AuthController } from '../controllers/auth.controller';

const router = Router();
const authController = new AuthController();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);
router.get('/profile', authenticateToken, authController.getProfile);

export { router as authRoutes };
