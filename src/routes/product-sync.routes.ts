import express from 'express';
import {
  syncProducts,
  getSyncedProducts,
  getSyncedProductById,
} from '../controllers/product-sync.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all routes
router.use(protect);

// Routes for synced products (available to all authenticated users)
router.get('/products', getSyncedProducts);
router.get('/products/:id', getSyncedProductById);

// Admin-only routes for managing synchronization
router.post('/sync', authorize('admin'), syncProducts);

export default router;
