import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProjectService } from '../services/project.service';
import { print } from 'ioredis';

const createProjectSchema = z.object({
  actorId: z.string().min(1, 'Actor ID is required'),
  projectName: z.string().min(1, 'Project name is required'),
  scriptText: z.string().optional(),
});

const renderProjectSchema = z.object({
  actorId: z.string().min(1, 'Actor ID is required'),
});

export class ProjectController {
  private projectService: ProjectService;

  constructor() {
    this.projectService = new ProjectService();
  }

  createProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = createProjectSchema.parse(req.body);
      const userId = req.userId!;


      const project = await this.projectService.createProject({
        userId,
        actorId: validated.actorId,
        projectName: validated.projectName,
        scriptText: validated.scriptText,
      });

      res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const project = await this.projectService.getProjectById(id);

      if (!project) {
        res.status(404).json({
          success: false,
          error: 'Project not found',
        });
        return;
      }

      res.json({
        success: true,
        data: project,
      });
    } catch (error) {
      next(error);
    }
  };

  getUserProjects = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.userId!;
      const projects = await this.projectService.getProjectsByUserId(userId);

      res.json({
        success: true,
        data: projects,
      });
    } catch (error) {
      next(error);
    }
  };

  renderProject = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const validated = renderProjectSchema.parse(req.body);
      const userId = req.userId!;

      const result = await this.projectService.renderProject(
        projectId,
        userId,
        validated.actorId
      );

      res.status(202).json({
        success: true,
        data: result,
        message: 'Render job accepted',
      });
    } catch (error) {
      next(error);
    }
  };

  generateScript = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { prompt } = req.body; // User sends: { "prompt": "A commercial for Nike" }

      if (!prompt) {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      const scenes = await this.projectService.generateScript(id, prompt);

      res.json({
        success: true,
        data: scenes,
        message: 'Script and scenes generated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  generateSketches = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Trigger the generation
      const scenes = await this.projectService.generateSketches(id);

      res.status(200).json({
        success: true,
        data: scenes,
        message: 'Sketches generated successfully',
      });
    } catch (error) {
      next(error);
    }
  };
  uploadStoryboard = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const files = (req.files as Express.Multer.File[]) || [];

      if (files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No sketch files uploaded. Use field name "sketches".',
        });
        return;
      }

      const scenes = await this.projectService.uploadStoryboard(id, files);

      res.status(200).json({
        success: true,
        data: scenes,
        message: 'Storyboard sketches uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  uploadSceneSketch = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sceneId } = req.params;
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        res.status(400).json({
          success: false,
          error: 'No sketch file uploaded. Use field name "sketch".',
        });
        return;
      }

      const scene = await this.projectService.uploadSceneSketch(sceneId, file);

      res.status(200).json({
        success: true,
        data: scene,
        message: 'Scene sketch uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getSceneSketches = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sceneId } = req.params;
      const sketches = await this.projectService.getSceneSketches(sceneId);

      res.status(200).json({
        success: true,
        data: sketches,
      });
    } catch (error) {
      next(error);
    }
  };

  downloadSceneSketch = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sceneId } = req.params;
      const userId = req.userId!;
      const { buffer, contentType, filename } =
        await this.projectService.getSceneSketchDownloadBuffer(sceneId, userId);

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename.replace(/"/g, "")}"`,
      );
      res.setHeader("Content-Type", contentType);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };

  generateImages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Trigger the generation using the service
      const scenes = await this.projectService.generateFinalImages(id);

      res.status(200).json({
        success: true,
        data: scenes,
        message: 'Photorealistic images generated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  regenerateScene = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sceneId } = req.params;
      const { prompt } = req.body; // Optional new prompt

      const scene = await this.projectService.regenerateScene(sceneId, prompt);

      res.json({
        success: true,
        data: scene,
        message: 'Scene regenerated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // ... inside ProjectController class ...

  compileMovie = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('compileMovie called with params:');
      const { id } = req.params;
      
      // This might take a long time! 
      // In production, just return "Job Started" and process in background.
      // For now, we await it (be careful of HTTP timeouts).
      const movieUrl = await this.projectService.compileFullMovie(id);

      res.status(200).json({
        success: true,
        data: { videoUrl: movieUrl },
        message: 'Full movie compiled successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}