// src/index.js
// Main entry point for the Medio Backend API Server.

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env.js';
import { connectRedis } from './config/redis.js';
import { setupJobs } from './jobs/queue.js';
import { setupSocket } from './socket/index.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import pharmacyRoutes from './routes/pharmacy.routes.js';
import riderRoutes from './routes/rider.routes.js';
import userRoutes from './routes/user.routes.js';

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // 1. Database & Cache Connection
  console.log('[BOOTSTRAP] Connecting to database cache services...');
  await connectRedis();

  // 2. Socket.io setup
  console.log('[BOOTSTRAP] Mounting Socket.io real-time layer...');
  const io = setupSocket(server);
  
  // Expose Socket.io instance to standard Express routes via request app
  app.set('io', io);

  // 3. Background Jobs Scheduler setup
  console.log('[BOOTSTRAP] Spawning background worker queues...');
  setupJobs(io);

  // 4. Express Global Middleware
  app.use(helmet({
    crossOriginResourcePolicy: false // Allows local media uploads sharing
  }));
  app.use(cors({
    origin: '*', // Dynamic CORS or custom frontend domains
    credentials: true
  }));
  app.use(express.json());

  // Serve local uploads folder statically for prescription assets
  app.use('/uploads', express.static(path.resolve('uploads')));

  // 5. REST API Routes
  console.log('[BOOTSTRAP] Registering REST API endpoints...');
  app.use('/api/auth', authRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/pharmacy', pharmacyRoutes);
  app.use('/api/rider', riderRoutes);
  app.use('/api/user', userRoutes);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'UP', 
      timestamp: new Date(),
      redis: req.app.get('io') ? 'Active' : 'Missing'
    });
  });

  // 6. Centralized Error Handling Middleware
  app.use(errorHandler);

  // 7. Bind Server Listener
  const PORT = env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Medio API Backend is online on port: ${PORT}`);
    console.log(`🟢 Health endpoint: http://localhost:${PORT}/health`);
    console.log(`======================================================\n`);
  });

  // Graceful Shutdown
  const handleShutdown = async () => {
    console.log('\n[SHUTDOWN] Terminating API server gracefully...');
    server.close(() => {
      console.log('[SHUTDOWN] HTTP/WS Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

bootstrap().catch((err) => {
  console.error('[CRITICAL BOOT FAILURE] Server failed to start:', err);
  process.exit(1);
});
