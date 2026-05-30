// src/services/order.service.js
// Orchestrates the order lifecycle and state transitions.

import { db } from '../config/db.js';
import * as geoService from './geo.service.js';
import * as flashService from './flash.service.js';
import { addOrderExpiryJob } from '../jobs/queue.js';
import { env } from '../config/env.js';

export const createOrder = async (userId, payload, file, io) => {
  const { type, items, deliveryLat, deliveryLng, deliveryAddress, totalAmount } = payload;
  
  // 1. Calculate flash expiry time (3 minutes from now)
  const flashWindowSeconds = Number(env.FLASH_WINDOW_SECONDS) || 180;
  const flashExpiresAt = new Date(Date.now() + flashWindowSeconds * 1000);
  
  // 2. Handle prescription upload path if present
  let rxImageUrl = null;
  if (type === 'RX' && file) {
    if (file.path) {
      // Local storage path or Cloudinary URL
      rxImageUrl = file.path.startsWith('http') 
        ? file.path 
        : `/uploads/${file.filename}`;
    }
  }

  // Parses items from JSON string if sent via FormData
  const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

  let orderData = {
    type,
    userId,
    items: parsedItems,
    deliveryLat: Number(deliveryLat),
    deliveryLng: Number(deliveryLng),
    deliveryAddress,
    totalAmount: totalAmount ? Number(totalAmount) : null,
    flashExpiresAt
  };

  if (type === 'RX') {
    // Prescription-driven flow (Flash window)
    orderData.status = 'PENDING_FLASH';
    orderData.rxImageUrl = rxImageUrl;

    // Create order in database
    const order = await db.order.create({
      data: orderData
    });

    console.log(`[ORDER] Created prescription order ${order.id}. Filtering nearby pharmacies...`);

    // Fetch nearest online pharmacies (within 3km radius)
    const radiusKm = Number(env.FLASH_RADIUS_KM) || 3;
    const maxPharmacies = Number(env.FLASH_MAX_PHARMACIES) || 5;
    
    const pharmacies = await geoService.getNearbyPharmacies(
      orderData.deliveryLat, 
      orderData.deliveryLng, 
      radiusKm, 
      maxPharmacies
    );

    if (pharmacies.length === 0) {
      console.warn(`[ORDER] No pharmacies found within ${radiusKm}km for order ${order.id}. Auto-expiring.`);
      await db.order.update({
        where: { id: order.id },
        data: { status: 'FLASH_EXPIRED' }
      });
      return { order, error: 'No pharmacies nearby. Please try again later.' };
    }

    // Trigger Socket.io flash broadcasting
    await flashService.broadcastFlashPing(order, pharmacies, io);

    // Register 3-minute background expiry job
    const delayMs = flashWindowSeconds * 1000;
    await addOrderExpiryJob(order.id, delayMs, io);

    return { order, targetedPharmaciesCount: pharmacies.length };
    
  } else {
    // OTC Flow (Cart experience - direct buy)
    // Find closest pharmacy automatically to fulfill this OTC order
    const nearestPharmacies = await geoService.getNearbyPharmacies(
      orderData.deliveryLat, 
      orderData.deliveryLng, 
      10, // Wider 10km radius for OTC direct checkout
      1
    );

    if (nearestPharmacies.length === 0) {
      throw new Error('No pharmacies available in your area for direct fulfillment');
    }

    const assignedPharmacy = nearestPharmacies[0];
    
    // Direct e-commerce order creates already ACCEPTED/PACKAGING status
    orderData.status = 'ACCEPTED';
    orderData.pharmacyId = assignedPharmacy.id;
    orderData.acceptedAt = new Date();

    const order = await db.order.create({
      data: orderData,
      include: {
        pharmacy: { select: { name: true, phone: true } }
      }
    });

    console.log(`[ORDER] Direct OTC Order ${order.id} automatically assigned to Pharmacy: ${assignedPharmacy.name}`);
    
    if (io) {
      // Alert the pharmacy about direct e-commerce order to pack
      io.to(`pharmacy:${assignedPharmacy.id}`).emit('DIRECT_OTC_ORDER', {
        orderId: order.id,
        items: order.items,
        deliveryAddress: order.deliveryAddress
      });
    }

    return { order };
  }
};

/**
 * Fetch detailed order status
 */
export const getOrderById = async (orderId, userId, role) => {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, phone: true } },
      pharmacy: { select: { name: true, phone: true } },
      rider: { select: { name: true, phone: true, lat: true, lng: true } }
    }
  });

  if (!order) {
    throw new Error('Order not found');
  }

  // Security check: ensure requesting actor is authorized to read this order
  if (role === 'USER' && order.userId !== userId) {
    throw new Error('Unauthorized access');
  }
  if (role === 'PHARMACY' && order.pharmacyId !== userId) {
    throw new Error('Unauthorized access');
  }
  if (role === 'RIDER' && order.riderId !== userId) {
    throw new Error('Unauthorized access');
  }

  return order;
};

/**
 * Fetch all orders for a user
 */
export const getUserOrders = async (userId) => {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
};
