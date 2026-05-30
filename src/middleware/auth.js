// src/middleware/auth.js
// Enforces JWT validation and role-based access control (RBAC).

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { redisClient } from '../config/redis.js';
import crypto from 'crypto';

// Hash function to compare with blacklisted refresh tokens in Redis
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Format: Bearer <token>' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify accessToken
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    
    // Check if user/actor has been revoked (optional for access tokens, but essential if checking a blacklist)
    req.user = {
      id: decoded.sub,
      role: decoded.role,
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token' });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden. Requires role: ${allowedRoles.join(' or ')}` });
    }
    
    next();
  };
};
