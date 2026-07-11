import { Router } from 'express';
import { ActorController } from '../controllers/actor.controller';

const router = Router();
const actorController = new ActorController();

// GET /actors - Get all available actors
router.get('/', actorController.getAllActors);

// GET /actors/:id - Get actor by ID
router.get('/:id', actorController.getActorById);

export { router as actorRoutes };