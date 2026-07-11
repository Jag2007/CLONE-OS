// src/index.ts
import 'reflect-metadata';
import express from 'express';
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

const app = express();

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

// Routes
app.use('/auth', authRoutes);
app.use('/actors', actorRoutes);
app.use('/projects', projectRoutes);
app.use('/users', userRoutes);
app.use('/public', infoRoutes); // Non-auth public route

app.use('/payments', paymentRoutes);
app.use('/clone', cloneRoutes);

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

const startServer = async () => {
  try {
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    app.listen(config.port,'0.0.0.0', () => {
      console.log(`CloneOS Orchestrator running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
