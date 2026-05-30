// src/middleware/upload.js
// Handles file uploading for prescription images.
// Connects to Cloudinary if keys are set, otherwise falls back to saving files locally in /uploads directory.

import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs';

// Configure Cloudinary if credentials are not demo/default
const useCloudinary = 
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_CLOUD_NAME !== 'demo' &&
  env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_KEY !== 'demo' &&
  env.CLOUDINARY_API_SECRET && env.CLOUDINARY_API_SECRET !== 'demo';

let upload;

if (useCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET
  });

  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'medio_prescriptions',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'pdf'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
  });

  upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });
  console.log('[UPLOAD] Configured prescription upload to Cloudinary storage.');
} else {
  // Local disk storage fallback
  const uploadDir = path.resolve('uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, 'rx-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|pdf/;
    const mimeType = allowedTypes.test(file.mimetype);
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimeType && extName) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpg, png, webp) and PDFs are allowed!'));
  };

  upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
  });
  console.log('[UPLOAD] Configured prescription upload to Local disk storage (uploads/).');
}

export const uploadRx = upload.single('rxImage');
export const isCloudinaryActive = useCloudinary;
