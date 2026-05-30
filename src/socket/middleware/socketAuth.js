// src/socket/middleware/socketAuth.js
// Authenticates Socket.io connection handshakes using JWT access tokens.

import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const socketAuth = (socket, next) => {
  try {
    const tokenHeader = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!tokenHeader) {
      return next(new Error('Authentication token required'));
    }

    const token = tokenHeader.startsWith('Bearer ') 
      ? tokenHeader.split(' ')[1] 
      : tokenHeader;

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    
    // Inject actor details into socket instance
    socket.user = {
      id: decoded.sub,
      role: decoded.role
    };

    console.log(`[SOCKET AUTH] Connected: ${socket.user.role} (${socket.user.id})`);
    next();
  } catch (err) {
    console.warn('[SOCKET AUTH] Connection rejected. Invalid token:', err.message);
    next(new Error('Invalid authentication token'));
  }
};
