// src/routes/pharmacy.routes.js
// Endpoints for Pharmacy dashboard operations.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { db } from '../config/db.js';
import * as flashService from '../services/flash.service.js';
import * as dispatchService from '../services/dispatch.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('PHARMACY'));

// Fetch pharmacy profile
router.get('/profile', async (req, res, next) => {
  try {
    const pharmacy = await db.pharmacy.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, phone: true, licenseNo: true, isOnline: true, lat: true, lng: true }
    });
    res.json(pharmacy);
  } catch (error) {
    next(error);
  }
});

// Update online status
router.put('/status', async (req, res, next) => {
  try {
    const { isOnline } = req.body;
    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({ error: 'isOnline status must be boolean' });
    }

    const updated = await db.pharmacy.update({
      where: { id: req.user.id },
      data: { isOnline }
    });

    res.json({ id: updated.id, isOnline: updated.isOnline });
  } catch (error) {
    next(error);
  }
});

// Accept order (REST API backup for WS client)
router.post('/orders/:id/accept', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const pharmacyId = req.user.id;
    const io = req.app.get('io');

    const result = await flashService.acceptOrder(pharmacyId, orderId, io);
    if (!result.success) {
      return res.status(409).json(result); // 409 Conflict
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Mark order as packed & trigger dispatch
router.post('/orders/:id/packed', async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const pharmacyId = req.user.id;
    const io = req.app.get('io');

    const order = await db.order.findUnique({
      where: { id: orderId }
    });

    if (!order || order.pharmacyId !== pharmacyId) {
      return res.status(404).json({ error: 'Order not found or not assigned to you' });
    }

    await db.order.update({
      where: { id: orderId },
      data: {
        status: 'READY_FOR_PICKUP',
        packedAt: new Date()
      }
    });

    if (io) {
      io.to(`order:${orderId}`).emit('ORDER_READY', { orderId });
    }

    // Trigger rider dispatch query
    await dispatchService.dispatchRider(orderId, io);

    res.json({ success: true, status: 'READY_FOR_PICKUP' });
  } catch (error) {
    next(error);
  }
});

export default router;
