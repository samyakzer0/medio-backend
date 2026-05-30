// src/services/auth.service.js
// Handles User OTP flow, Pharmacy & Rider password flow, and JWT token rotation.

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../config/db.js';
import { redisClient } from '../config/redis.js';
import { env } from '../config/env.js';

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Mock OTP for development if SMS gateway is not configured
const MOCK_OTP = '123456';

export const requestUserOtp = async (phone) => {
  // Generate a random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store OTP in Redis with expiry
  const redisKey = `otp:${phone}`;
  await redisClient.set(redisKey, otp, { EX: env.OTP_EXPIRY_SECONDS });
  
  console.log(`[SMS AUTH] OTP for ${phone} is: ${otp} (Expires in ${env.OTP_EXPIRY_SECONDS}s)`);
  
  // Simulating Fast2SMS or other gateways if API Key exists
  if (env.FAST2SMS_API_KEY) {
    try {
      console.log(`[SMS AUTH] Integration: Sending OTP via SMS Gateway...`);
      // Here you would integrate the real fast2sms API request
    } catch (err) {
      console.error('[SMS AUTH] SMS Gateway Error:', err.message);
    }
  }
  
  return { success: true, message: 'OTP sent successfully (Check server logs in dev mode)' };
};

export const verifyUserOtp = async (phone, otp, name = 'New User') => {
  const redisKey = `otp:${phone}`;
  const storedOtp = await redisClient.get(redisKey);
  
  // In dev mode, allow MOCK_OTP if no OTP was requested
  const isValid = storedOtp === otp || (env.NODE_ENV === 'development' && otp === MOCK_OTP);
  
  if (!isValid) {
    throw new Error('Invalid or expired OTP');
  }
  
  // Delete OTP from Redis
  await redisClient.del(redisKey);
  
  // Upsert User in database
  let user = await db.user.findUnique({
    where: { phone }
  });
  
  if (!user) {
    user = await db.user.create({
      data: {
        phone,
        name
      }
    });
  }
  
  const tokens = await generateTokens(user.id, 'USER');
  return { user, ...tokens };
};

export const registerPharmacy = async (data) => {
  const { name, licenseNo, phone, password, lat, lng } = data;
  
  // Check if exists
  const existing = await db.pharmacy.findFirst({
    where: { OR: [{ phone }, { licenseNo }] }
  });
  
  if (existing) {
    throw new Error('Pharmacy with this phone or license number already exists');
  }
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  const pharmacy = await db.pharmacy.create({
    data: {
      name,
      licenseNo,
      phone,
      passwordHash,
      lat,
      lng,
      isOnline: true // Default to online for prototype ease
    }
  });
  
  // Note: Raw SQL to sync PostGIS geography column will trigger here if PostGIS migrations are applied.
  // In the db.js context, we can also execute a raw query to populate the PostGIS point:
  try {
    await db.$executeRawUnsafe(
      `UPDATE "Pharmacy" SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
      lng, lat, pharmacy.id
    );
  } catch (err) {
    console.warn('[PostGIS] Warning: PostGIS location column sync failed (Make sure PostGIS extension is loaded in Postgres):', err.message);
  }
  
  const tokens = await generateTokens(pharmacy.id, 'PHARMACY');
  return { pharmacy: { id: pharmacy.id, name: pharmacy.name, phone: pharmacy.phone }, ...tokens };
};

export const loginPharmacy = async (phone, password) => {
  const pharmacy = await db.pharmacy.findUnique({
    where: { phone }
  });
  
  if (!pharmacy) {
    throw new Error('Invalid credentials');
  }
  
  const isValid = await bcrypt.compare(password, pharmacy.passwordHash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }
  
  const tokens = await generateTokens(pharmacy.id, 'PHARMACY');
  return { pharmacy: { id: pharmacy.id, name: pharmacy.name, phone: pharmacy.phone, isOnline: pharmacy.isOnline }, ...tokens };
};

export const registerRider = async (data) => {
  const { name, phone, password } = data;
  
  const existing = await db.rider.findUnique({
    where: { phone }
  });
  
  if (existing) {
    throw new Error('Rider with this phone number already exists');
  }
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  const rider = await db.rider.create({
    data: {
      name,
      phone,
      passwordHash,
      isAvailable: true
    }
  });
  
  const tokens = await generateTokens(rider.id, 'RIDER');
  return { rider: { id: rider.id, name: rider.name, phone: rider.phone }, ...tokens };
};

export const loginRider = async (phone, password) => {
  const rider = await db.rider.findUnique({
    where: { phone }
  });
  
  if (!rider) {
    throw new Error('Invalid credentials');
  }
  
  const isValid = await bcrypt.compare(password, rider.passwordHash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }
  
  const tokens = await generateTokens(rider.id, 'RIDER');
  return { rider: { id: rider.id, name: rider.name, phone: rider.phone, isAvailable: rider.isAvailable }, ...tokens };
};

export const refreshSession = async (refreshToken) => {
  const hashedToken = hashToken(refreshToken);
  
  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new Error('Invalid or expired refresh token');
  }
  
  const { sub: userId, role } = decoded;
  
  // Check if token is active in Redis (enforces single-session refresh rotation)
  const tokenKey = `refresh:${userId}:${hashedToken}`;
  const exists = await redisClient.exists(tokenKey);
  
  if (!exists) {
    // Token reuse detected! Revoke all tokens for this user for security.
    const allUserKeys = await redisClient.keys(`refresh:${userId}:*`);
    if (allUserKeys.length > 0) {
      await redisClient.del(allUserKeys);
    }
    throw new Error('Refresh token revoked due to reuse detection');
  }
  
  // Revoke current token
  await redisClient.del(tokenKey);
  
  // Issue new pair
  return generateTokens(userId, role);
};

export const logoutSession = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    const hashedToken = hashToken(refreshToken);
    const tokenKey = `refresh:${decoded.sub}:${hashedToken}`;
    await redisClient.del(tokenKey);
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Invalid refresh token' };
  }
};

// Helper: Generates access and refresh tokens, stores refresh token in Redis
async function generateTokens(userId, role) {
  const accessToken = jwt.sign(
    { sub: userId, role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
  
  const refreshToken = jwt.sign(
    { sub: userId, role },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );
  
  // Store refresh token hash in Redis
  const hashedToken = hashToken(refreshToken);
  const tokenKey = `refresh:${userId}:${hashedToken}`;
  
  // Convert 30d/30h to seconds for Redis
  let expirySeconds = 30 * 24 * 60 * 60; // Default 30 days
  if (env.JWT_REFRESH_EXPIRES_IN.endsWith('d')) {
    expirySeconds = parseInt(env.JWT_REFRESH_EXPIRES_IN) * 24 * 60 * 60;
  } else if (env.JWT_REFRESH_EXPIRES_IN.endsWith('h')) {
    expirySeconds = parseInt(env.JWT_REFRESH_EXPIRES_IN) * 60 * 60;
  }
  
  await redisClient.set(tokenKey, 'active', { EX: expirySeconds });
  
  return { accessToken, refreshToken };
}
