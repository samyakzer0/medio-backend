// src/config/env.js
// Validates all required environment variables at startup.
// If any are missing, the process exits immediately with a clear error.

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000').transform(Number),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(20),
  JWT_REFRESH_SECRET: z.string().min(20),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),

  FAST2SMS_API_KEY: z.string().optional().default(''),
  OTP_EXPIRY_SECONDS: z.string().default('300').transform(Number),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  FLASH_RADIUS_KM: z.string().default('3').transform(Number),
  FLASH_MAX_PHARMACIES: z.string().default('5').transform(Number),
  FLASH_WINDOW_SECONDS: z.string().default('180').transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
