// src/routes/auth.routes.js
// Router for all auth-related actions.

import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';

const router = Router();

// Validation schemas
const phoneSchema = z.object({
  phone: z.string().min(10).max(15)
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
  name: z.string().optional()
});

const pharmacyRegisterSchema = z.object({
  name: z.string().min(2),
  licenseNo: z.string().min(5),
  phone: z.string().min(10),
  password: z.string().min(6),
  lat: z.number(),
  lng: z.number()
});

const loginSchema = z.object({
  phone: z.string().min(10),
  password: z.string().min(6)
});

const riderRegisterSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  password: z.string().min(6)
});

const refreshSchema = z.object({
  refreshToken: z.string()
});

// Routes
router.post('/user/request-otp', async (req, res, next) => {
  try {
    const { phone } = phoneSchema.parse(req.body);
    const result = await authService.requestUserOtp(phone);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/user/verify-otp', async (req, res, next) => {
  try {
    const { phone, otp, name } = verifyOtpSchema.parse(req.body);
    const result = await authService.verifyUserOtp(phone, otp, name);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/pharmacy/register', async (req, res, next) => {
  try {
    const validatedData = pharmacyRegisterSchema.parse(req.body);
    const result = await authService.registerPharmacy(validatedData);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/pharmacy/login', async (req, res, next) => {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const result = await authService.loginPharmacy(phone, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/rider/register', async (req, res, next) => {
  try {
    const validatedData = riderRegisterSchema.parse(req.body);
    const result = await authService.registerRider(validatedData);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/rider/login', async (req, res, next) => {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const result = await authService.loginRider(phone, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refreshSession(refreshToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.logoutSession(refreshToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
