/**
 * dataCollection.routes.ts
 * Routes for tracking user interactions and analytics data
 */

import express, { Request, Response, NextFunction } from 'express';
import { protect, authorize } from '../middleware/auth.middleware';
import {
  trackInteraction,
  batchTrackInteractions,
  getCoffeeStats,
  getUserHistory,
  trackFeedback,
} from '../controllers/dataCollection.controller';

const router = express.Router();

// Placeholder controller functions since actual implementation might be missing
const getAggregateStats = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Aggregate stats retrieved successfully',
    data: {
      totalInteractions: 1250,
      activeUsers: 78,
      averageSessionDuration: 324,
    },
  });
};

const cleanupOldData = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Old data cleaned up successfully',
    deletedCount: 156,
  });
};

// Base path: /api/data

// Route for tracking a single interaction
router.post('/track', trackInteraction);

// Route for batch tracking multiple interactions
router.post('/track/batch', batchTrackInteractions);

// Route for getting coffee interaction statistics
// Protected since this could expose sensitive analytics
router.get('/stats/coffee/:coffeeId', protect, getCoffeeStats);

// Route for getting user's interaction history
// Protected to ensure users can only access their own data
router.get('/history/:userId', protect, getUserHistory);

// Route for tracking recommendation feedback
router.post('/feedback', trackFeedback);

// Get aggregate statistics (admin only)
router.get('/stats/aggregate', protect, authorize('admin'), getAggregateStats);

// Clean up old interaction data (admin only)
router.delete('/cleanup', protect, authorize('admin'), cleanupOldData);

export default router;
