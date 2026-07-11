import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('actors')
export class Actor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'cost_per_video', type: 'int' })
  costPerVideo!: number;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}