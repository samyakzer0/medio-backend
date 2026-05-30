// src/services/flash.service.js
// Handles flash pings, concurrency race conditions, and order claims using Redis SETNX + DB SELECT FOR UPDATE.

import { db } from '../config/db.js';
import { getRedis, getIsRedisActive } from '../config/redis.js';
import { cancelExpiryTimer } from '../jobs/queue.js';

// Fallback storage for in-memory targets and locks
const memoryLocks = new Map();
const memoryTargets = new Map();

/**
 * Broadcasts flash ping to nearby pharmacies and saves target list
 */
export const broadcastFlashPing = async (order, pharmacies, io) => {
  const isRedisActive = getIsRedisActive();
  const redis = isRedisActive ? getRedis() : null;
  
  const pharmacyIds = pharmacies.map(p => p.id);
  const orderId = order.id;

  // 1. Save targets to state (Redis or In-Memory)
  if (isRedisActive) {
    const targetsKey = `flash:${orderId}:targets`;
    const statusKey = `flash:${orderId}:status`;
    
    // Store array as JSON string
    await redis.set(targetsKey, JSON.stringify(pharmacyIds), { EX: 240 }); // 4 mins
    await redis.set(statusKey, 'OPEN', { EX: 240 });
  } else {
    memoryTargets.set(orderId, {
      pharmacyIds,
      status: 'OPEN',
      expiresAt: Date.now() + 240 * 1000
    });
  }

  // 2. Emit Socket.io event to each pharmacy room
  if (io) {
    pharmacies.forEach(pharmacy => {
      console.log(`[FLASH] Emitting FLASH_PING to room pharmacy:${pharmacy.id} for order ${orderId}`);
      io.to(`pharmacy:${pharmacy.id}`).emit('FLASH_PING', {
        orderId,
        type: order.type,
        rxImageUrl: order.rxImageUrl,
        items: order.items,
        deliveryAddress: order.deliveryAddress,
        expiresAt: order.flashExpiresAt,
        distanceKm: Number((pharmacy.distanceMeters / 1000).toFixed(2))
      });
    });
  }
};

/**
 * Race Condition Claim Handler (The Critical Path)
 * Performs high-speed Redis lock check, followed by PostgreSQL SELECT FOR UPDATE backstop.
 */
export const acceptOrder = async (pharmacyId, orderId, io) => {
  const isRedisActive = getIsRedisActive();
  const redis = isRedisActive ? getRedis() : null;

  console.log(`[RACE CHECK] Pharmacy ${pharmacyId} attempting to accept order ${orderId}...`);

  // --- STEP 1: Fast Lock Check ---
  let hasLock = false;
  if (isRedisActive) {
    const lockKey = `lock:order:${orderId}`;
    // NX: Set only if key does not exist. EX: Expiry in 10 seconds to avoid deadlocks.
    hasLock = await redis.setNX(lockKey, pharmacyId, { EX: 10 });
  } else {
    // In-memory lock simulation
    const lockKey = `lock:order:${orderId}`;
    if (!memoryLocks.has(lockKey)) {
      memoryLocks.set(lockKey, {
        pharmacyId,
        expiresAt: Date.now() + 10000
      });
      hasLock = true;
    }
  }

  if (!hasLock) {
    console.log(`[RACE LOST] Order ${orderId} lock check failed. Already claimed.`);
    return { success: false, reason: 'ALREADY_CLAIMED' };
  }

  // --- STEP 2: Database SELECT FOR UPDATE Authoritative Check ---
  try {
    const result = await db.$transaction(async (tx) => {
      // Locking row with SELECT FOR UPDATE
      const order = await tx.$queryRaw`
        SELECT id, status, "userId" FROM "Order" 
        WHERE id = ${orderId} 
        FOR UPDATE;
      `;

      if (!order || order.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const orderRow = order[0];
      if (orderRow.status !== 'PENDING_FLASH') {
        throw new Error('ALREADY_CLAIMED');
      }

      // Update order to ACCEPTED state
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'ACCEPTED',
          pharmacyId: pharmacyId,
          acceptedAt: new Date()
        },
        include: {
          pharmacy: {
            select: { name: true, phone: true }
          }
        }
      });

      return updatedOrder;
    });

    console.log(`[RACE WON] Pharmacy ${pharmacyId} successfully claimed order ${orderId}!`);

    // --- STEP 3: Handle Post-Claim Broadcasts ---
    // Cancel the BullMQ/In-Memory 3-minute expiry timer
    await cancelExpiryTimer(orderId);

    // Get losing pharmacies to notify them
    const targets = await getFlashTargets(orderId);
    const losers = targets.filter(pId => pId !== pharmacyId);

    if (io) {
      // 1. Notify losers to hide flash ping
      losers.forEach(loserId => {
        io.to(`pharmacy:${loserId}`).emit('FLASH_TERMINATED', { 
          orderId, 
          reason: 'CLAIMED' 
        });
      });

      // 2. Lock current pharmacy screen to ACCEPTED state
      io.to(`pharmacy:${pharmacyId}`).emit('ORDER_LOCKED', { orderId });

      // 3. Notify user that order was accepted
      io.to(`user:${result.userId}`).emit('ORDER_ACCEPTED', {
        orderId,
        pharmacyName: result.pharmacy.name,
        pharmacyPhone: result.pharmacy.phone
      });

      // Join the pharmacy and user sockets to order general updates room
      io.to(`order:${orderId}`).emit('ORDER_ACCEPTED', {
        orderId,
        pharmacyName: result.pharmacy.name
      });
    }

    // Clean up Redis/Memory flash details
    await cleanupFlashMetadata(orderId);

    return { success: true, order: result };

  } catch (err) {
    console.error(`[RACE ERROR] Concurrency check caught exception for order ${orderId}:`, err.message);
    
    // Clean up local lock if database check fails
    if (isRedisActive) {
      await redis.del(`lock:order:${orderId}`);
    } else {
      memoryLocks.delete(`lock:order:${orderId}`);
    }

    const reason = err.message === 'ALREADY_CLAIMED' ? 'ALREADY_CLAIMED' : 'SYSTEM_ERROR';
    return { success: false, reason };
  }
};

/**
 * Retrieve targeted pharmacies for an order
 */
export const getFlashTargets = async (orderId) => {
  const isRedisActive = getIsRedisActive();
  
  if (isRedisActive) {
    const redis = getRedis();
    const data = await redis.get(`flash:${orderId}:targets`);
    return data ? JSON.parse(data) : [];
  } else {
    const meta = memoryTargets.get(orderId);
    return meta ? meta.pharmacyIds : [];
  }
};

/**
 * Delete metadata keys
 */
export const cleanupFlashMetadata = async (orderId) => {
  const isRedisActive = getIsRedisActive();
  
  if (isRedisActive) {
    const redis = getRedis();
    await redis.del([
      `flash:${orderId}:targets`,
      `flash:${orderId}:status`,
      `lock:order:${orderId}`
    ]);
  } else {
    memoryTargets.delete(orderId);
    memoryLocks.delete(`lock:order:${orderId}`);
  }
};
