/**
 * engagement.routes.ts
 * Routes for likes and comments functionality
 */

import { Router } from 'express';
import EngagementController from '../controllers/engagement.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// All engagement routes require authentication
router.use(protect);

// Like routes
router.post('/like/:targetType/:targetId', EngagementController.toggleLike);
router.get('/likes/:targetType/:targetId', EngagementController.getLikes);

// Comment routes
router.get('/comments/:targetType/:targetId', EngagementController.getComments);
router.post('/comments/:targetType/:targetId', EngagementController.createComment);
router.put('/comments/:commentId', EngagementController.updateComment);
router.delete('/comments/:commentId', EngagementController.deleteComment);

// Comment moderation (admin only)
router.put('/comments/:commentId/moderate', EngagementController.moderateComment);

export default router; 