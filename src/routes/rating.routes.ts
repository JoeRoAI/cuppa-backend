/**
 * rating.routes.ts
 * Routes for coffee rating functionality
 */

import express, { Request, Response, NextFunction } from 'express';
import { protect } from '../middleware/auth.middleware';
import {
  rateCoffee,
  getCoffeeRatings,
  getUserRatings,
  updateRating,
  deleteRating,
} from '../controllers/rating.controller';
import { afterRatingCreated, afterRatingUpdated, afterRatingDeleted } from '../middleware/taste-profile.middleware';

const router = express.Router();

// Coffee rating routes with taste profile middleware
router.post('/coffee/:coffeeId/rate', protect, rateCoffee as express.RequestHandler, afterRatingCreated);
router.get('/coffee/:coffeeId/ratings', getCoffeeRatings as express.RequestHandler);

// User rating routes
router.get('/users/:userId/ratings', getUserRatings as express.RequestHandler);
router.get('/profile/ratings', protect, ((req: Request, res: Response) => {
  // Add proper type assertion
  const user = (req as any).user;
  if (user && user.id) {
    req.params.userId = user.id;
    return getUserRatings(req, res);
  }
  return res.status(401).json({ success: false, message: 'Not authenticated' });
}) as express.RequestHandler);

// Rating management routes with taste profile middleware
router.put('/ratings/:ratingId', protect, updateRating as express.RequestHandler, afterRatingUpdated);
router.delete('/ratings/:ratingId', protect, deleteRating as express.RequestHandler, afterRatingDeleted);

export default router; 