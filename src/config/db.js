// src/config/db.js
// Prisma client singleton — prevents connection pool exhaustion
// in serverless/hot-reload environments.

import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const globalForPrisma = globalThis;

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
