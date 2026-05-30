// src/jobs/queue.js
// Orchestrates background jobs.
// Uses BullMQ if Redis is active, otherwise falls back to a custom in-memory setTimeout scheduler to avoid crashing.

import { Queue, Worker } from 'bullmq';
import { createBullConnection, getIsRedisActive } from '../config/redis.js';
import { db } from '../config/db.js';
import * as flashService from '../services/flash.service.js';
import * as dispatchService from '../services/dispatch.service.js';

let orderExpiryQueue;
let riderDispatchQueue;

// Memory stores for in-memory timers fallback
const inMemoryTimers = new Map();

export function setupJobs(io) {
  const isRedisActive = getIsRedisActive();
  
  if (isRedisActive) {
    console.log('[JOBS] Initializing BullMQ background workers...');
    
    const connection = createBullConnection();

    // 1. Order Expiry Queue & Worker
    orderExpiryQueue = new Queue('order-expiry', { connection });
    
    new Worker('order-expiry', async (job) => {
      const { orderId } = job.data;
      console.log(`[JOBS] Processing order expiry for order: ${orderId}`);
      await handleOrderExpiry(orderId, io);
    }, { connection });

    // 2. Rider Dispatch Queue & Worker
    riderDispatchQueue = new Queue('rider-dispatch', { connection });
    
    new Worker('rider-dispatch', async (job) => {
      const { orderId } = job.data;
      console.log(`[JOBS] Processing rider dispatch retry for order: ${orderId}`);
      await handleRiderDispatchRetry(orderId, io);
    }, { connection });
    
  } else {
    console.log('[JOBS] Running in in-memory scheduler fallback mode.');
  }
}

// Expire order business logic
export async function handleOrderExpiry(orderId, io) {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId }
    });

    if (!order) return;

    // Only expire if it's still awaiting acceptance (PENDING_FLASH)
    if (order.status === 'PENDING_FLASH') {
      await db.order.update({
        where: { id: orderId },
        data: { status: 'FLASH_EXPIRED' }
      });
      
      console.log(`[JOBS] Order ${orderId} has expired. No pharmacy accepted in time.`);

      // Broadcast termination event to rooms
      // Get all targeted pharmacies from flash service
      const targets = await flashService.getFlashTargets(orderId);
      if (targets && io) {
        targets.forEach(pharmacyId => {
          io.to(`pharmacy:${pharmacyId}`).emit('FLASH_TERMINATED', { 
            orderId, 
            reason: 'EXPIRED' 
          });
        });
      }

      // Notify the user
      if (io) {
        io.to(`user:${order.userId}`).emit('ORDER_EXPIRED', { orderId });
        io.to(`order:${orderId}`).emit('ORDER_EXPIRED', { orderId });
      }
      
      // Clean up redis/mem lock metadata
      await flashService.cleanupFlashMetadata(orderId);
    }
  } catch (err) {
    console.error(`[JOBS] Error during order ${orderId} expiry processing:`, err.message);
  }
}

// Rider Dispatch Retry logic
export async function handleRiderDispatchRetry(orderId, io) {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId }
    });

    if (!order || order.status !== 'READY_FOR_PICKUP') {
      return; // Already assigned or cancelled
    }

    console.log(`[JOBS] Retrying rider dispatch assignment for order ${orderId}...`);
    await dispatchService.dispatchRider(orderId, io);
  } catch (err) {
    console.error(`[JOBS] Error during rider dispatch retry for order ${orderId}:`, err.message);
  }
}

// Queue Job interface
export async function addOrderExpiryJob(orderId, delayMs, io) {
  if (getIsRedisActive() && orderExpiryQueue) {
    await orderExpiryQueue.add(
      `expire-${orderId}`, 
      { orderId }, 
      { delay: delayMs, removeOnComplete: true }
    );
  } else {
    // In-memory fallback
    console.log(`[JOBS] In-Memory: Scheduled order expiry for ${orderId} in ${delayMs}ms`);
    
    // Cancel existing timer for this order if any
    const existing = inMemoryTimers.get(`expire:${orderId}`);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      inMemoryTimers.delete(`expire:${orderId}`);
      await handleOrderExpiry(orderId, io);
    }, delayMs);
    
    inMemoryTimers.set(`expire:${orderId}`, timer);
  }
}

export async function addRiderDispatchRetryJob(orderId, delayMs, io) {
  if (getIsRedisActive() && riderDispatchQueue) {
    await riderDispatchQueue.add(
      `dispatch-${orderId}`, 
      { orderId }, 
      { delay: delayMs, removeOnComplete: true }
    );
  } else {
    // In-memory fallback
    console.log(`[JOBS] In-Memory: Scheduled rider dispatch retry for ${orderId} in ${delayMs}ms`);
    
    const existing = inMemoryTimers.get(`dispatch:${orderId}`);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      inMemoryTimers.delete(`dispatch:${orderId}`);
      await handleRiderDispatchRetry(orderId, io);
    }, delayMs);
    
    inMemoryTimers.set(`dispatch:${orderId}`, timer);
  }
}

export async function cancelExpiryTimer(orderId) {
  if (getIsRedisActive()) {
    // BullMQ removes finished jobs, we don't strictly need to delete unless we want to,
    // but the transaction state checks ensure double-processing is avoided.
  } else {
    const timer = inMemoryTimers.get(`expire:${orderId}`);
    if (timer) {
      clearTimeout(timer);
      inMemoryTimers.delete(`expire:${orderId}`);
      console.log(`[JOBS] In-Memory: Cancelled order expiry timer for ${orderId}`);
    }
  }
}
