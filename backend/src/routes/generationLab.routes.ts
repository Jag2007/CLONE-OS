import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { GenerationLabController } from '../controllers/generationLab.controller';

const router = Router();
const generationLabController = new GenerationLabController();
const GENERATION_LAB_ALLOWED_EMAIL = 'demo1@cloneos.com';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, or WEBP images are allowed'));
    }
  },
});

const requireGenerationLabAccess = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.user?.email?.toLowerCase() === GENERATION_LAB_ALLOWED_EMAIL) {
    next();
    return;
  }

  res.status(403).json({
    success: false,
    error: 'Generation Lab is only available for the demo1@cloneos.com account.',
  });
};

router.use(authMiddleware);
router.use(requireGenerationLabAccess);

router.get('/', generationLabController.listJobs);
router.get('/:id', generationLabController.getJob);
router.post('/', generationLabController.createJob);
router.post('/upload', imageUpload.single('image'), generationLabController.uploadInputImage);

export { router as generationLabRoutes };
