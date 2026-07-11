import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Scene } from './Scene';
import { User } from './User';

export enum FeedbackImageType {
  SKETCH = 'sketch',
  FINAL = 'final',
}

export enum FeedbackRating {
  UP = 'up',
  DOWN = 'down',
}

@Entity('feedback')
@Unique('uq_feedback_scene_user_image', ['sceneId', 'userId', 'imageType'])
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'scene_id' })
  sceneId!: string;

  @ManyToOne(() => Scene, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scene_id' })
  scene!: Scene;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'image_type',
    type: 'enum',
    enum: FeedbackImageType,
  })
  imageType!: FeedbackImageType;

  @Column({
    type: 'enum',
    enum: FeedbackRating,
  })
  rating!: FeedbackRating;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
