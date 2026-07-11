import { DataSource } from 'typeorm';
import { config } from './env';
import { User } from '../entities/User';
import { Project } from '../entities/Project';
import { Actor } from '../entities/Actor';
import { Scene } from '../entities/Scene';
import { SceneSketch } from '../entities/SceneSketch';
import { Info } from '../entities/Info';
import { Feedback } from '../entities/Feedback';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  ssl: config.database.ssl,
  synchronize: config.nodeEnv === 'development',
  // logging: config.nodeEnv === 'development',
  entities: [User, Project, Actor, Scene, SceneSketch, Info, Feedback],
  migrations: ['src/migrations/*.ts'],
  subscribers: [],
});