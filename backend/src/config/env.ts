// src/config/env.ts
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  RAZORPAY_KEY_ID: z.string(),
  RAZORPAY_KEY_SECRET: z.string(),
  RAZORPAY_WEBHOOK_SECRET: z.string(),
  PORT: z.string().default("3000"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DB_HOST: z.string(),
  DB_PORT: z.string().default("5432"),
  DB_USERNAME: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SSL: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379"),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  OPENAI_API_KEY: z.string(),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_BUCKET_NAME: z.string(),
  STORAGE_DRIVER: z.enum(["s3", "local"]).default("s3"),
  BACKEND_PUBLIC_URL: z.string().default("http://localhost:3001"),
  IMAGE_GENERATION_API_URL: z.string().default("http://localhost:8000"),
  VIDEO_WORKER_API_URL: z.string().default("http://localhost:8001"),
  VIDEO_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  REPLICATE_VIDEO_MODEL: z.string().default("wan-video/wan-2.5-i2v-fast"),
  REPLICATE_VIDEO_IMAGE_FIELD: z.string().default("image"),
  REPLICATE_VIDEO_PROMPT_FIELD: z.string().default("prompt"),
  REPLICATE_VIDEO_DURATION: z.string().default("5"),
  REPLICATE_VIDEO_ASPECT_RATIO: z.string().default("16:9"),
});

const env = envSchema.parse(process.env);

export const config = {
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  },
  port: parseInt(env.PORT, 10),
  frontendUrl: env.FRONTEND_URL,
  corsOrigins: (env.CORS_ORIGINS || env.FRONTEND_URL)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  nodeEnv: env.NODE_ENV,
  database: {
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT, 10),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  },
  aws: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    bucketName: env.AWS_BUCKET_NAME,
  },
  storage: {
    driver: env.STORAGE_DRIVER,
    backendPublicUrl: env.BACKEND_PUBLIC_URL.replace(/\/$/, ""),
  },
  redis: {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT, 10),
    password: env.REDIS_PASSWORD,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
    imageModel: env.OPENAI_IMAGE_MODEL,
  },
  workers: {
    imageGenerationApiUrl: env.IMAGE_GENERATION_API_URL,
    videoWorkerApiUrl: env.VIDEO_WORKER_API_URL,
    videoApiKey: env.VIDEO_API_KEY,
    replicateApiToken: env.REPLICATE_API_TOKEN,
    replicateVideoModel: env.REPLICATE_VIDEO_MODEL,
    replicateVideoImageField: env.REPLICATE_VIDEO_IMAGE_FIELD,
    replicateVideoPromptField: env.REPLICATE_VIDEO_PROMPT_FIELD,
    replicateVideoDuration: env.REPLICATE_VIDEO_DURATION,
    replicateVideoAspectRatio: env.REPLICATE_VIDEO_ASPECT_RATIO,
  },
};
