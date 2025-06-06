/**
 * checkin.routes.ts
 * Routes for coffee shop check-ins
 */

import express, { Request, Response, NextFunction } from 'express';
import { protect } from '../middleware/auth.middleware';
import {
  createCheckIn,
  getShopCheckIns,
  getUserCheckIns,
  deleteCheckIn,
  updateCheckIn,
} from '../controllers/checkin.controller';

const router = express.Router();

// Base paths:
// - /api/shops/:shopId/check-in (POST - create a check-in)
// - /api/shops/:shopId/check-ins (GET - list check-ins for a shop)
// - /api/users/:userId/check-ins (GET - list check-ins for a user)
// - /api/check-ins/:checkInId (DELETE/PATCH - manage a specific check-in)

// Route for creating a check-in (protected - user must be logged in)
router.post('/shops/:shopId/check-in', protect, createCheckIn as express.RequestHandler);

// Route for getting all check-ins for a shop
router.get('/shops/:shopId/check-ins', getShopCheckIns as express.RequestHandler);

// Route for getting all check-ins for a user
router.get('/users/:userId/check-ins', getUserCheckIns as express.RequestHandler);

// Routes for managing a specific check-in (protected - user must be logged in)
router.delete('/check-ins/:checkInId', protect, deleteCheckIn as express.RequestHandler);
router.patch('/check-ins/:checkInId', protect, updateCheckIn as express.RequestHandler);

export default router;
