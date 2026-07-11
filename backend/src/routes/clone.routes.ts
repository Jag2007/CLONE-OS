import { Router } from 'express';
import { CloneController } from '../controllers/clone.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const cloneController = new CloneController();

router.use(authMiddleware);

// POST /clone/start - Deduct credits before starting clone training (returns 402 if insufficient)
router.post('/start', cloneController.startClone);

export { router as cloneRoutes };
