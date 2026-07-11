import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './env';

export const redisConnection = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: null,
});

export const videoGenerationQueue = new Queue('video-generation-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

console.log('Redis queue initialized');