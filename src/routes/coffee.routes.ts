import express from 'express';
import {
  getCoffees,
  getCoffee,
  createCoffee,
  updateCoffee,
  deleteCoffee,
  getCoffeeByBarcode,
  bulkBarcodeLookup,
} from '../controllers/coffee.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Public routes
router.get('/', getCoffees);

// Barcode lookup routes
router.get('/barcode/:code', getCoffeeByBarcode);
router.post('/barcode/bulk', bulkBarcodeLookup);

// Single coffee route (must come after other specific routes)
router.get('/:id', getCoffee);

// Protected routes (admin only)
router.post('/', protect, authorize('admin'), createCoffee);
router.put('/:id', protect, authorize('admin'), updateCoffee);
router.delete('/:id', protect, authorize('admin'), deleteCoffee);

export default router;
