// src/socket/index.js
// Socket.io Real-time Layer — orchestration of rooms, handlers, and real-time dispatch state.

import { Server } from 'socket.io';
import { socketAuth } from './middleware/socketAuth.js';
import * as flashService from '../services/flash.service.js';
import * as dispatchService from '../services/dispatch.service.js';
import { db } from '../config/db.js';

export function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // Whitelisted origins or '*' for demo
      methods: ['GET', 'POST']
    }
  });

  // Apply JWT authentication
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;

    // 1. Join default individual room based on Actor Role
    if (role === 'USER') {
      socket.join(`user:${userId}`);
    } else if (role === 'PHARMACY') {
      socket.join(`pharmacy:${userId}`);
    } else if (role === 'RIDER') {
      socket.join(`rider:${userId}`);
    }

    console.log(`[SOCKET] Socket connected: ${socket.id} (User: ${userId}, Role: ${role})`);

    // 2. Subscribe to standard order rooms
    socket.on('JOIN_ORDER', ({ orderId }) => {
      socket.join(`order:${orderId}`);
      console.log(`[SOCKET] ${role} (${userId}) joined room: order:${orderId}`);
    });

    // 3. EVENT: Pharmacy Accepts Flash Ping (Race condition claim)
    socket.on('PHARMACY_ACCEPT', async ({ orderId }, callback) => {
      if (role !== 'PHARMACY') {
        return callback && callback({ success: false, error: 'Forbidden' });
      }

      const result = await flashService.acceptOrder(userId, orderId, io);
      if (callback) {
        callback(result);
      }
    });

    // 4. EVENT: Pharmacy finishes packing order, ready for pickup
    socket.on('PHARMACY_PACKED', async ({ orderId }) => {
      if (role !== 'PHARMACY') return;

      console.log(`[SOCKET] Pharmacy ${userId} completed packaging checklist for order ${orderId}`);

      try {
        await db.order.update({
          where: { id: orderId, pharmacyId: userId },
          data: {
            status: 'READY_FOR_PICKUP',
            packedAt: new Date()
          }
        });

        // Notify user about Packaging complete
        io.to(`order:${orderId}`).emit('ORDER_READY', { orderId });
        io.to(`user:${userId}`).emit('ORDER_READY', { orderId });

        // Trigger rider dispatch
        await dispatchService.dispatchRider(orderId, io);
      } catch (err) {
        console.error('[SOCKET] PHARMACY_PACKED failed:', err.message);
      }
    });

    // 5. EVENT: Live Rider Location Update
    socket.on('RIDER_LOCATION', async ({ lat, lng }) => {
      if (role !== 'RIDER') return;
      await dispatchService.updateRiderLocation(userId, lat, lng, io);
    });

    // 6. EVENT: Rider picks up package from Pharmacy
    socket.on('RIDER_PICKUP', async ({ orderId }) => {
      if (role !== 'RIDER') return;

      console.log(`[SOCKET] Rider ${userId} picked up package for order ${orderId}`);

      try {
        const order = await db.order.update({
          where: { id: orderId, riderId: userId },
          data: {
            status: 'IN_TRANSIT',
            pickedUpAt: new Date()
          }
        });

        io.to(`order:${orderId}`).emit('ORDER_IN_TRANSIT', { orderId });
        io.to(`user:${order.userId}`).emit('ORDER_IN_TRANSIT', { orderId });
      } catch (err) {
        console.error('[SOCKET] RIDER_PICKUP failed:', err.message);
      }
    });

    // 7. EVENT: Rider delivers package to User
    socket.on('RIDER_DELIVERED', async ({ orderId }) => {
      if (role !== 'RIDER') return;

      console.log(`[SOCKET] Rider ${userId} completed delivery for order ${orderId}`);

      try {
        const order = await db.$transaction(async (tx) => {
          const updated = await tx.order.update({
            where: { id: orderId, riderId: userId },
            data: {
              status: 'DELIVERED',
              deliveredAt: new Date()
            }
          });

          await tx.rider.update({
            where: { id: userId },
            data: { isAvailable: true }
          });

          return updated;
        });

        io.to(`order:${orderId}`).emit('ORDER_DELIVERED', { orderId, deliveredAt: order.deliveredAt });
        io.to(`user:${order.userId}`).emit('ORDER_DELIVERED', { orderId });
        
        // Notify rider of success
        socket.emit('DELIVERY_CONFIRMED', { orderId });
      } catch (err) {
        console.error('[SOCKET] RIDER_DELIVERED failed:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}
