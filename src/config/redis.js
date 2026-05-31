// src/config/redis.js
// Shared Redis client with built-in in-memory fallback.
// If Redis is down, we fallback to an in-memory Map to store locks, OTPs, and tokens, avoiding crashes.

import { createClient } from 'redis';
import { env } from './env.js';

let client;
export let redisClient;
let isRedisActive = false;

// Memory fallback store
const memoryStore = new Map();

export async function connectRedis() {
  client = createClient({ url: env.REDIS_URL });
  
  let warned = false;
  client.on('error', (err) => {
    if (!warned) {
      console.warn('[REDIS] Warning: Redis client connection error. Fallback to in-memory mode.', err.message);
      warned = true;
    }
    isRedisActive = false;
  });

  try {
    // Attempt connection with timeout
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 3000))
    ]);
    isRedisActive = true;
    console.log('✅ Redis connected successfully.');
  } catch (err) {
    console.warn('⚠️ Redis not available. Running in in-memory fallback mode.');
    isRedisActive = false;
    try {
      await client.disconnect();
    } catch (e) {}
    
    // Create a mock client that matches required methods to prevent crashes
    client = {
      set: async (key, value, options) => {
        memoryStore.set(key, value);
        if (options && options.EX) {
          setTimeout(() => memoryStore.delete(key), options.EX * 1000);
        }
        return 'OK';
      },
      get: async (key) => {
        return memoryStore.get(key) || null;
      },
      del: async (key) => {
        if (Array.isArray(key)) {
          let count = 0;
          key.forEach(k => {
            if (memoryStore.delete(k)) count++;
          });
          return count;
        }
        return memoryStore.delete(key) ? 1 : 0;
      },
      exists: async (key) => {
        return memoryStore.has(key) ? 1 : 0;
      },
      keys: async (pattern) => {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Array.from(memoryStore.keys()).filter(key => regex.test(key));
      },
      // Redis locks SETNX NX EX
      setNX: async (key, value, options) => {
        if (memoryStore.has(key)) {
          return false;
        }
        memoryStore.set(key, value);
        if (options && options.EX) {
          setTimeout(() => memoryStore.delete(key), options.EX * 1000);
        }
        return true;
      }
    };
  }
  redisClient = client;
  return client;
}

export function getRedis() {
  if (!client) throw new Error('Redis not initialized. Call connectRedis() first.');
  return client;
}

export function getIsRedisActive() {
  return isRedisActive;
}

// BullMQ needs its own connection factory
export function createBullConnection() {
  try {
    const url = new URL(env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    };
  } catch (err) {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}
