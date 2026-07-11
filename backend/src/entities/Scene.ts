import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './Project';
import type { SceneSketch } from './SceneSketch';

// Define Scene Status here or in types/index.ts
export enum SceneStatus {
  PENDING = 'pending',           // Text only
  SKETCHED = 'sketched',         // Has sketch_url
  LORA_PROCESSED = 'lora_processed', // Has final_image_url
}

@Entity('scenes')
export class Scene {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', nullable: true })
  projectId!: string | null;

  // Link back to Parent Project
  @ManyToOne(() => Project, (project) => project.scenes, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;

  @Column({ type: 'int', name: 'sequence_order' })
  sequenceOrder!: number; // 1, 2, 3...

  @Column({ type: 'text', name: 'script_text' })
  scriptText!: string; // "A hero stands in rain"

  @Column({ type: 'text', name: 'ai_prompt', nullable: true })
  aiPrompt!: string | null; // "Cinematic wide shot, cyberprep..."

  @Column({ name: 'sketch_url', type: 'text', nullable: true })
  sketchUrl!: string | null;

  @Column({ name: 'final_image_url', type: 'text', nullable: true })
  finalImageUrl!: string | null;

  @Column({
    type: 'enum',
    enum: SceneStatus,
    default: SceneStatus.PENDING,
  })
  status!: SceneStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Runtime-only field hydrated by ProjectService when returning scenes in a
   * project response. Points at the SceneSketch row currently marked active
   * (same URL as `sketchUrl`, but also exposes `source` and history id).
   * Not persisted — never decorated with @Column.
   */
  activeSketch?: SceneSketch | null;
}