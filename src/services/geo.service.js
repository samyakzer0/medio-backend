// src/services/geo.service.js
// Handles geospatial queries (radius searches) for pharmacies and riders.
// Includes a built-in Haversine memory fallback if PostGIS is not enabled in the database.

import { db } from '../config/db.js';

// Haversine formula to compute distance in meters between two points
export const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

/**
 * Find online pharmacies within a specific radius of a coordinate
 */
export const getNearbyPharmacies = async (lat, lng, radiusKm = 3, limit = 5) => {
  const radiusMeters = radiusKm * 1000;
  
  try {
    // Attempt PostGIS query first
    const pharmacies = await db.$queryRaw`
      SELECT id, name, phone, lat, lng,
        ST_Distance(location, ST_MakePoint(${lng}, ${lat})::geography) AS distance_m
      FROM "Pharmacy"
      WHERE "isOnline" = true
        AND ST_DWithin(
          location,
          ST_MakePoint(${lng}, ${lat})::geography,
          ${radiusMeters}
        )
      ORDER BY distance_m ASC
      LIMIT ${limit};
    `;
    
    return pharmacies.map(p => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      lat: p.lat,
      lng: p.lng,
      distanceMeters: Number(p.distance_m)
    }));
  } catch (err) {
    console.warn('[PostGIS] Warning: PostGIS ST_DWithin query failed. Falling back to Haversine in-memory calculation:', err.message);
    
    // In-memory fallback
    const allOnline = await db.pharmacy.findMany({
      where: { isOnline: true }
    });
    
    const near = allOnline
      .map(p => {
        const dist = calculateHaversineDistance(lat, lng, p.lat, p.lng);
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          lat: p.lat,
          lng: p.lng,
          distanceMeters: dist
        };
      })
      .filter(p => p.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);
      
    return near;
  }
};

/**
 * Find available riders within a radius of a coordinate
 */
export const getNearbyRiders = async (lat, lng, radiusKm = 10, limit = 1) => {
  const radiusMeters = radiusKm * 1000;
  
  try {
    // Attempt PostGIS query
    const riders = await db.$queryRaw`
      SELECT id, name, phone, lat, lng,
        ST_Distance(location, ST_MakePoint(${lng}, ${lat})::geography) AS distance_m
      FROM "Rider"
      WHERE "isAvailable" = true
        AND lat IS NOT NULL
        AND lng IS NOT NULL
        AND ST_DWithin(
          location,
          ST_MakePoint(${lng}, ${lat})::geography,
          ${radiusMeters}
        )
      ORDER BY distance_m ASC
      LIMIT ${limit};
    `;
    
    return riders.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      lat: r.lat,
      lng: r.lng,
      distanceMeters: Number(r.distance_m)
    }));
  } catch (err) {
    console.warn('[PostGIS] Warning: PostGIS rider query failed. Falling back to Haversine:', err.message);
    
    const availableRiders = await db.rider.findMany({
      where: {
        isAvailable: true,
        lat: { not: null },
        lng: { not: null }
      }
    });
    
    const near = availableRiders
      .map(r => {
        const dist = calculateHaversineDistance(lat, lng, r.lat, r.lng);
        return {
          id: r.id,
          name: r.name,
          phone: r.phone,
          lat: r.lat,
          lng: r.lng,
          distanceMeters: dist
        };
      })
      .filter(r => r.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);
      
    return near;
  }
};
