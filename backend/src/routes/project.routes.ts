import { Router } from 'express';
import multer from 'multer';
import { ProjectController } from '../controllers/project.controller';
import { FeedbackController } from '../controllers/feedback.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const projectController = new ProjectController();
const feedbackController = new FeedbackController();

// In-memory upload for storyboard sketches (streams straight to S3)
const sketchUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10, // hard cap, service enforces exact scene count
  },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, or WEBP images are allowed'));
    }
  },
});

// All project routes require authentication
router.use(authMiddleware);

// POST /projects - Create a new project
router.post('/', projectController.createProject);

// GET /projects - Get all projects for current user
router.get('/', projectController.getUserProjects);

// GET /projects/:id - Get project by ID
router.get('/:id', projectController.getProject);

// POST /projects/:id/render - Start rendering a project
router.post('/:id/render', projectController.renderProject);

// POST /projects/:id/script - Generate the storyboard scenes
router.post('/:id/script', projectController.generateScript);

// POST /projects/:id/sketches - Generate images for the scenes
router.post('/:id/sketches', projectController.generateSketches);

// POST /projects/scenes/:sceneId/sketch-ai - Generate an AI sketch for one scene
router.post('/scenes/:sceneId/sketch-ai', projectController.generateSceneSketch);

// POST /projects/:id/storyboard - Upload user-provided storyboard sketches
// multipart/form-data, field name: "sketches" (one file per scene, in order)
router.post(
  '/:id/storyboard',
  sketchUpload.array('sketches', 10),
  projectController.uploadStoryboard
);

// POST /projects/scenes/:sceneId/sketch - Upload a single sketch for one scene
// multipart/form-data, field name: "sketch"
router.post(
  '/scenes/:sceneId/sketch',
  sketchUpload.single('sketch'),
  projectController.uploadSceneSketch
);

// GET /projects/scenes/:sceneId/sketches - Full history (ai + user) for a scene
router.get('/scenes/:sceneId/sketches', projectController.getSceneSketches);

// GET /projects/scenes/:sceneId/sketch-download - Download active sketch (attachment)
router.get(
  '/scenes/:sceneId/sketch-download',
  projectController.downloadSceneSketch,
);

// POST /projects/:id/images - Generate final photorealistic images
router.post('/:id/images', projectController.generateImages);

// POST /projects/scenes/:sceneId/image - Generate final photorealistic image for one scene
router.post('/scenes/:sceneId/image', projectController.generateSceneImage);

// POST /projects/scenes/:sceneId/regenerate
router.post('/scenes/:sceneId/regenerate', projectController.regenerateScene);

// POST /projects/:id/compile - Compile the final movie
router.post('/:id/compile', projectController.compileMovie);

// POST /projects/scenes/:sceneId/feedback - Submit feedback on a scene's sketch or final image
router.post('/scenes/:sceneId/feedback', feedbackController.submitFeedback);

// GET /projects/:id/feedback - List all feedback across all scenes of a project
router.get('/:id/feedback', feedbackController.getProjectFeedback);

export { router as projectRoutes };
