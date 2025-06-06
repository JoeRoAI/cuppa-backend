/**
 * activity-feed.routes.ts
 * Routes for the activity feed functionality
 */

import { Router } from 'express';
import ActivityFeedController from '../controllers/activity-feed.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// Public activity feed (shows general activity or mock data)
router.get('/', ActivityFeedController.getFeed);

// Protected routes require authentication
router.use(protect);

// Get activity feed for a specific user
router.get('/user/:userId', ActivityFeedController.getUserProfileFeed);

// Get activity statistics
router.get('/stats', ActivityFeedController.getActivityStats);
router.get('/stats/:userId', ActivityFeedController.getActivityStats);

// Create and delete activities
router.post('/activity', ActivityFeedController.createActivity);
router.delete('/activity/:activityId', ActivityFeedController.deleteActivity);

export default router;
