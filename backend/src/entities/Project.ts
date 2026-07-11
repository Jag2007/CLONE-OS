import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany, // <--- Added this
} from 'typeorm';
import { User } from './User';
import { Scene } from './Scene'; // <--- Added this
import { ProjectStatus } from '../types';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.projects)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // NEW RELATIONSHIP
  @OneToMany(() => Scene, (scene) => scene.project)
  scenes!: Scene[];

  @Column({
    type: 'enum',
    // Updated Enum to support the full pipeline
    enum: ['draft', 'storyboarding', 'casting', 'processing', 'completed'], 
    default: 'draft',
  })
  status!: ProjectStatus;

  @Column({ name: 'storage_url', nullable: true })
  storageUrl!: string;


  @Column({ name: 'project_name' })
  projectName!: string;

  @Column({ name: 'actor_id', nullable: true })
  actorId!: string;

  @Column({ name: 'script_text', type: 'text', nullable: true })
  scriptText!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}