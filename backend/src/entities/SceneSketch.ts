import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Scene } from './Scene';

export enum SketchSource {
  AI = 'ai',
  USER = 'user',
}

@Entity('scene_sketches')
@Index('idx_scene_sketches_scene_created', ['sceneId', 'createdAt'])
export class SceneSketch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'scene_id' })
  sceneId!: string;

  @ManyToOne(() => Scene, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scene_id' })
  scene!: Scene;

  @Column({ type: 'text' })
  url!: string;

  @Column({
    type: 'enum',
    enum: SketchSource,
  })
  source!: SketchSource;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
