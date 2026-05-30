// src/routes/user.routes.js
// Endpoints for User profile.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { db } from '../config/db.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole('USER'));

router.get('/profile', async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      include: { addresses: true }
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
