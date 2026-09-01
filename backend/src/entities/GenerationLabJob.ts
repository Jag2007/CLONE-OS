import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';

export enum GenerationLabMode {
  I2V = 'i2v',
  T2V = 't2v',
  IMAGE = 'image',
}

export enum GenerationLabStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

@Entity('generation_lab_jobs')
export class GenerationLabJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: GenerationLabMode,
  })
  mode!: GenerationLabMode;

  @Column({
    type: 'enum',
    enum: GenerationLabStatus,
    default: GenerationLabStatus.PENDING,
  })
  status!: GenerationLabStatus;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ type: 'text', nullable: true })
  model!: string | null;

  @Column({ name: 'task_id', type: 'text', nullable: true })
  taskId!: string | null;

  @Column({ name: 'input_image_url', type: 'text', nullable: true })
  inputImageUrl!: string | null;

  @Column({ name: 'result_url', type: 'text', nullable: true })
  resultUrl!: string | null;

  @Column({ name: 'storage_url', type: 'text', nullable: true })
  storageUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
