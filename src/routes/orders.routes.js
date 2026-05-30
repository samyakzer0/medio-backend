// src/routes/orders.routes.js
// Handles order endpoints including prescription uploading and cart checkouts.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadRx } from '../middleware/upload.js';
import * as orderService from '../services/order.service.js';

const router = Router();

// Create order endpoint (supports single prescription file upload)
router.post('/', requireAuth, uploadRx, async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    
    // Parse order fields from payload
    const payload = {
      type: req.body.type,
      items: req.body.items,
      deliveryLat: req.body.deliveryLat,
      deliveryLng: req.body.deliveryLng,
      deliveryAddress: req.body.deliveryAddress,
      totalAmount: req.body.totalAmount
    };

    const result = await orderService.createOrder(userId, payload, req.file, io);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Fetch detailed status of an order
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;

    const order = await orderService.getOrderById(orderId, userId, role);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

// Fetch user's order history
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orders = await orderService.getUserOrders(userId);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

export default router;
