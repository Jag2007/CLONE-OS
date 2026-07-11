// src/entities/Info.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('waiting_list')
export class Info {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  company!: string | null;

  @Column({ name: 'use_case', type: 'text', nullable: true })
  useCase!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
