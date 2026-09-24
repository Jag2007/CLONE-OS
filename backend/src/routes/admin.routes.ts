import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { AdminController } from '../controllers/admin.controller';

const router = Router();
const adminController = new AdminController();

// All admin routes require authentication and admin privileges
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/users', adminController.getUsers);
router.get('/stats', adminController.getStats);
router.post('/users/:userId/credits', adminController.updateUserCredits);
router.patch('/users/:userId/plan', adminController.updateUserPlan);
router.patch('/users/:userId/role', adminController.updateUserRole);

export { router as adminRoutes };
