import express from 'express';
import {
  getCoffeesBySupplier,
  getCoffeesByCollection,
  getCoffeeRatings,
  getCoffeeCollections,
  getFullCoffeeDetails,
  associateCoffeeWithSupplier,
  addCoffeeToCollection,
  getSupplierWithCoffeeCount,
  getRecommendedCoffees,
} from '../controllers/integration.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Public routes for retrieving data
router.get('/supplier/:id/coffees', getCoffeesBySupplier);
router.get('/supplier/:id/details', getSupplierWithCoffeeCount);
router.get('/coffee/:id/ratings', getCoffeeRatings);
router.get('/coffee/:id/collections', getCoffeeCollections);
router.get('/coffee/:id/full', getFullCoffeeDetails);

// Protected routes requiring authentication
router.get('/collection/:id/coffees', protect, getCoffeesByCollection);
router.get('/recommendations', protect, getRecommendedCoffees);

// Routes for modifying data - require role-based authorization
router.put(
  '/coffee/:coffeeId/supplier/:supplierId',
  protect,
  authorize('admin'),
  associateCoffeeWithSupplier
);
router.put('/collection/:collectionId/coffee/:coffeeId', protect, addCoffeeToCollection);

export default router;
