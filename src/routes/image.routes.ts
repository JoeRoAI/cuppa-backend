import express from 'express';
import { protect } from '../middleware/auth.middleware';
import { uploadProfileImage, uploadReviewImages } from '../middleware/upload.middleware';
import {
  rateLimitImageUploads,
  validateImageFile,
  validateImagePermissions,
  setImageSecurityHeaders
} from '../middleware/security.middleware';
import {
  uploadProfileImage as uploadProfileImageController,
  uploadReviewImages as uploadReviewImagesController,
  deleteProfileImage,
  deleteReviewImage,
} from '../controllers/image.controller';

const router = express.Router();

// Apply security headers to all image routes
router.use(setImageSecurityHeaders);

// Protect all routes with authentication
router.use(protect);

// Profile image routes with enhanced security
router.post('/profile', 
  validateImagePermissions('upload'),
  rateLimitImageUploads(5, 15 * 60 * 1000), // 5 uploads per 15 minutes
  uploadProfileImage,
  validateImageFile,
  uploadProfileImageController
);

router.delete('/profile', 
  validateImagePermissions('delete'),
  deleteProfileImage
);

// Review image routes with enhanced security
router.post('/review/:ratingId', 
  validateImagePermissions('upload'),
  rateLimitImageUploads(10, 15 * 60 * 1000), // 10 uploads per 15 minutes for reviews
  uploadReviewImages,
  validateImageFile,
  uploadReviewImagesController
);

router.delete('/review/:ratingId/:imageUrl', 
  validateImagePermissions('delete'),
  deleteReviewImage
);

export default router; 