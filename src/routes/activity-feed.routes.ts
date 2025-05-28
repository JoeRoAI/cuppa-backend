/**
 * activity-feed.routes.ts
 * Routes for the activity feed functionality
 */

import { Router } from 'express';
import ActivityFeedController from '../controllers/activity-feed.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// All activity feed routes require authentication
router.use(protect);

// Get current user's activity feed
router.get('/', ActivityFeedController.getFeed);

// Get activity feed for a specific user
router.get('/user/:userId', ActivityFeedController.getUserProfileFeed);

// Get activity statistics
router.get('/stats', ActivityFeedController.getActivityStats);
router.get('/stats/:userId', ActivityFeedController.getActivityStats);

// Create and delete activities
router.post('/activity', ActivityFeedController.createActivity);
router.delete('/activity/:activityId', ActivityFeedController.deleteActivity);

export default router; 