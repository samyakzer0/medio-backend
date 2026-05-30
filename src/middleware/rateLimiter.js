// src/middleware/rateLimiter.js
// Basic rate limiter middleware to protect authentication and order creation endpoints.

import rateLimit from 'express-rate-limit';

// Standard API rate limiter (100 requests per minute)
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Protect OTP requests from abuse (3 requests per 15 minutes)
export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many OTP requests. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Protect OTP verification from brute-force (5 requests per 15 minutes)
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Protect order placement from spam (10 requests per minute)
export const orderPlacementLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many order requests. Please check your order status before placing another.' },
  standardHeaders: true,
  legacyHeaders: false,
});
