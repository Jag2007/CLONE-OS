export enum ProjectStatus {
  DRAFT = 'draft',
  STORYBOARDING = 'storyboarding', // Generating sketches
  CASTING = 'casting',             // Applying Actor LoRA
  PROCESSING = 'processing',       // Rendering Final Video
  COMPLETED = 'completed',
}
export interface CreateProjectDTO {
  userId: string;
  actorId: string;
  projectName: string;
  scriptText?: string;
}

export interface RenderProjectDTO {
  actorId: string;
}

export interface VideoGenerationJobData {
  projectId: string;
  userId: string;
  actorId: string;
  actorName: string;
  scriptText?: string;
  timestamp: string;
}

export interface ActorInfo {
  id: string;
  name: string;
  triggerWord: string;
  costPerVideo: number;
  avatarUrl?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}