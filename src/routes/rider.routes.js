// src/routes/rider.routes.js
// Endpoints for Rider app operations.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { db } from '../config/db.js';
import * as dispatchService from '../services/dispatch.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('RIDER'));

// Fetch rider profile and active assignment
router.get('/orders/active', async (req, res, next) => {
  try {
    const riderId = req.user.id;
    const activeOrder = await db.order.findFirst({
      where: {
        riderId,
        status: { in: ['RIDER_ASSIGNED', 'IN_TRANSIT'] }
      },
      include: {
        user: { select: { name: true, phone: true } },
        pharmacy: { select: { name: true, phone: true, lat: true, lng: true } }
      }
    });

    res.json(activeOrder || null);
  } catch (error) {
    next(error);
  }
});

// Update rider's live location
router.put('/location', async (req, res, next) => {
  try {
    const riderId = req.user.id;
    const { lat, lng } = req.body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }

    const io = req.app.get('io');
    const updated = await dispatchService.updateRiderLocation(riderId, lat, lng, io);
    res.json({ success: true, lat: updated.lat, lng: updated.lng });
  } catch (error) {
    next(error);
  }
});

// Mark order as picked up
router.post('/orders/:id/pickup', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const riderId = req.user.id;
    const io = req.app.get('io');

    const order = await db.order.findFirst({
      where: { id: orderId, riderId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await db.order.update({
      where: { id: orderId },
      data: {
        status: 'IN_TRANSIT',
        pickedUpAt: new Date()
      }
    });

    if (io) {
      io.to(`order:${orderId}`).emit('ORDER_IN_TRANSIT', { orderId });
      io.to(`user:${order.userId}`).emit('ORDER_IN_TRANSIT', { orderId });
    }

    res.json({ success: true, status: 'IN_TRANSIT' });
  } catch (error) {
    next(error);
  }
});

// Mark order as delivered
router.post('/orders/:id/deliver', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const riderId = req.user.id;
    const io = req.app.get('io');

    const order = await db.order.findFirst({
      where: { id: orderId, riderId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Set order as delivered and mark rider available in a transaction
    const deliveredAt = new Date();
    await db.$transaction([
      db.order.update({
        where: { id: orderId },
        data: {
          status: 'DELIVERED',
          deliveredAt
        }
      }),
      db.rider.update({
        where: { id: riderId },
        data: { isAvailable: true }
      })
    ]);

    if (io) {
      io.to(`order:${orderId}`).emit('ORDER_DELIVERED', { orderId, deliveredAt });
      io.to(`user:${order.userId}`).emit('ORDER_DELIVERED', { orderId });
    }

    res.json({ success: true, status: 'DELIVERED' });
  } catch (error) {
    next(error);
  }
});

export default router;
