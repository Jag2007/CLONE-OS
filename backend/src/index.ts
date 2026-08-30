// src/index.ts
import 'reflect-metadata';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { AppDataSource } from './config/database';
import { actorRoutes } from './routes/actor.routes';
import { projectRoutes } from './routes/project.routes';
import { userRoutes } from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth.routes';
import infoRoutes from './routes/info.routes';
import paymentRoutes from './routes/payment.routes';
import { cloneRoutes } from './routes/clone.routes';
import { generationLabRoutes } from './routes/generationLab.routes';

const app = express();
let databaseStartupError: unknown = null;

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

const formatStartupError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
};

const requireDatabase = (_req: Request, res: Response, next: NextFunction) => {
  if (AppDataSource.isInitialized) {
    next();
    return;
  }

  res.status(503).json({
    success: false,
    error: 'Database not connected',
    details: databaseStartupError ? formatStartupError(databaseStartupError) : undefined,
  });
};

// Health check stays available even when the database is down, so local
// debugging does not look like a completely dead backend.
app.get('/health', (_, res) => {
  const database = AppDataSource.isInitialized
    ? { connected: true }
    : {
        connected: false,
        error: databaseStartupError ? formatStartupError(databaseStartupError) : undefined,
      };

  res.status(AppDataSource.isInitialized ? 200 : 503).json({
    status: AppDataSource.isInitialized ? 'ok' : 'degraded',
    database,
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/auth', requireDatabase, authRoutes);
app.use('/actors', requireDatabase, actorRoutes);
app.use('/projects', requireDatabase, projectRoutes);
app.use('/users', requireDatabase, userRoutes);
app.use('/public', requireDatabase, infoRoutes); // Non-auth public route

app.use('/payments', requireDatabase, paymentRoutes);
app.use('/clone', requireDatabase, cloneRoutes);
app.use('/generation-lab', requireDatabase, generationLabRoutes);

// Production-friendly API aliases. Static frontend hosts can reserve page paths
// like /generation-lab while proxying backend traffic through /api.
app.use('/api/auth', requireDatabase, authRoutes);
app.use('/api/actors', requireDatabase, actorRoutes);
app.use('/api/projects', requireDatabase, projectRoutes);
app.use('/api/users', requireDatabase, userRoutes);
app.use('/api/public', requireDatabase, infoRoutes);
app.use('/api/payments', requireDatabase, paymentRoutes);
app.use('/api/clone', requireDatabase, cloneRoutes);
app.use('/api/generation-lab', requireDatabase, generationLabRoutes);

// Error handler
app.use(errorHandler);

const startServer = async () => {
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`CloneOS Orchestrator running on port ${config.port}`);
  });

  try {
    await AppDataSource.initialize();
    databaseStartupError = null;
    console.log('Database connected successfully');
  } catch (error) {
    databaseStartupError = error;
    console.error('Database connection failed:', error);
  }
};

startServer();
