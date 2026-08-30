import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { GenerationLabController } from '../controllers/generationLab.controller';

const router = Router();
const generationLabController = new GenerationLabController();

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

router.use(authMiddleware);

router.get('/', generationLabController.listJobs);
router.get('/:id', generationLabController.getJob);
router.post('/', generationLabController.createJob);
router.post('/upload', imageUpload.single('image'), generationLabController.uploadInputImage);

export { router as generationLabRoutes };
