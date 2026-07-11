import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const userController = new UserController();

// POST /users - Create a new user (no auth required)
router.post('/', userController.createUser);

// Protected routes
router.use(authMiddleware);

// GET /users/me - Get current user info
router.get('/me', userController.getCurrentUser);

// GET /users/credits - Get current user's credits
router.get('/credits', userController.getCredits);

// POST /users/credits - Add credits to current user
router.post('/credits', userController.addCredits);

export { router as userRoutes };