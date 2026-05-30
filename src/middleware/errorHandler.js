// src/middleware/errorHandler.js
// Centralized Express error handler. Handles Zod errors, custom errors, and formats responses consistently.

import { z } from 'zod';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  console.error('[SERVER ERROR]', err);

  // 1. Zod input validation errors
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
  }

  // 2. Custom logical errors from services
  if (
    err.message === 'Invalid credentials' || 
    err.message === 'Invalid or expired OTP' ||
    err.message === 'Invalid or expired refresh token' ||
    err.message === 'Refresh token revoked due to reuse detection'
  ) {
    return res.status(401).json({ error: err.message });
  }

  if (err.message === 'Unauthorized access') {
    return res.status(403).json({ error: err.message });
  }

  if (err.message === 'Order not found') {
    return res.status(404).json({ error: err.message });
  }

  if (err.message.includes('already exists')) {
    return res.status(409).json({ error: err.message });
  }

  // 3. Fallback for unknown runtime exceptions
  const response = {
    error: err.message || 'An unexpected server error occurred'
  };

  if (env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(500).json(response);
};
