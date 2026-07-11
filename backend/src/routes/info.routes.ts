import { Router } from 'express';

import { submitInfo } from '../controllers/info.controller';

const router = Router();

// Public route for info submission
router.post('/info', submitInfo);

export default router;
