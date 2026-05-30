// src/services/dispatch.service.js
// Handles rider selection, routing, dispatch queue, and real-time delivery state updates.

import { db } from '../config/db.js';
import * as geoService from './geo.service.js';
import { addRiderDispatchRetryJob } from '../jobs/queue.js';

export const dispatchRider = async (orderId, io) => {
  console.log(`[DISPATCH] Starting dispatch sequence for order: ${orderId}`);
  
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { pharmacy: true }
    });

    if (!order) {
      console.error(`[DISPATCH] Order ${orderId} not found.`);
      return;
    }

    // Only dispatch if the order is ready for pickup
    if (order.status !== 'READY_FOR_PICKUP') {
      console.log(`[DISPATCH] Order ${orderId} status is ${order.status}. Skipping dispatch.`);
      return;
    }

    const pharmacy = order.pharmacy;
    if (!pharmacy) {
      console.error(`[DISPATCH] Pharmacy details missing for order ${orderId}.`);
      return;
    }

    // Find the nearest available rider (within 10km radius)
    const nearestRiders = await geoService.getNearbyRiders(pharmacy.lat, pharmacy.lng, 10, 1);
    
    if (nearestRiders.length === 0) {
      console.log(`[DISPATCH] No available riders found for order ${orderId}. Queueing retry in 30s...`);
      
      // Schedule dispatch retry job (30 seconds)
      await addRiderDispatchRetryJob(orderId, 30000, io);
      return;
    }

    const assignedRider = nearestRiders[0];
    
    // Assign order to rider in a transaction
    await db.$transaction([
      db.order.update({
        where: { id: orderId },
        data: {
          riderId: assignedRider.id,
          status: 'RIDER_ASSIGNED'
        }
      }),
      db.rider.update({
        where: { id: assignedRider.id },
        data: { isAvailable: false }
      })
    ]);

    console.log(`[DISPATCH] Assigned Rider ${assignedRider.name} to order ${orderId}`);

    // Emit socket events
    if (io) {
      // 1. Notify the user and pharmacy
      io.to(`order:${orderId}`).emit('RIDER_ASSIGNED', {
        orderId,
        riderId: assignedRider.id,
        riderName: assignedRider.name,
        riderPhone: assignedRider.phone,
        eta: '10 mins'
      });
      
      io.to(`user:${order.userId}`).emit('RIDER_ASSIGNED', {
        orderId,
        riderName: assignedRider.name,
        riderPhone: assignedRider.phone
      });

      // 2. Alert the rider directly to request pickup
      io.to(`rider:${assignedRider.id}`).emit('PICKUP_ASSIGNED', {
        orderId,
        pharmacyName: pharmacy.name,
        pharmacyAddress: `${pharmacy.lat}, ${pharmacy.lng}`, // Simulating address
        deliveryAddress: order.deliveryAddress,
        lat: pharmacy.lat,
        lng: pharmacy.lng
      });
    }

  } catch (err) {
    console.error(`[DISPATCH] Failed dispatch for order ${orderId}:`, err.message);
  }
};

/**
 * Handle rider location tracking update
 */
export const updateRiderLocation = async (riderId, lat, lng, io) => {
  try {
    // Update coordinates in database
    const updatedRider = await db.rider.update({
      where: { id: riderId },
      data: { lat, lng }
    });

    // Update PostGIS geography point (runs raw SQL)
    try {
      await db.$executeRawUnsafe(
        `UPDATE "Rider" SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
        lng, lat, riderId
      );
    } catch (err) {
      // PostGIS failure warning caught silently
    }

    // Broadcast rider's location to all active order channels assigned to this rider
    const activeOrders = await db.order.findMany({
      where: {
        riderId,
        status: { in: ['RIDER_ASSIGNED', 'IN_TRANSIT'] }
      }
    });

    if (io) {
      activeOrders.forEach(order => {
        io.to(`order:${order.id}`).emit('RIDER_LOCATION', {
          orderId: order.id,
          riderId,
          lat,
          lng
        });
      });
    }

    return updatedRider;
  } catch (err) {
    console.error(`[DISPATCH] Error updating rider ${riderId} location:`, err.message);
    throw err;
  }
};
