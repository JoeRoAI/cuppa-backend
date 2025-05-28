/**
 * social-connection.routes.ts
 * Routes for managing social connections and social-based recommendations
 */

import express from 'express';
import SocialConnectionController from '../controllers/social-connection.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

// Apply authentication middleware to all social connection routes
router.use(protect);

// Follow/unfollow routes
router.post('/follow/:userId', SocialConnectionController.followUser);
router.post('/unfollow/:userId', SocialConnectionController.unfollowUser);
router.post('/block/:userId', SocialConnectionController.blockUser);

// Connection information routes
router.get('/followers', SocialConnectionController.getFollowers);
router.get('/following', SocialConnectionController.getFollowing);
router.get('/is-following/:userId', SocialConnectionController.isFollowing);
router.get('/suggestions', SocialConnectionController.getSuggestedUsers);
router.get('/stats', SocialConnectionController.getConnectionStats);

// Recommendation routes related to social features
router.get('/recommendations', SocialConnectionController.getSocialRecommendations);
router.get('/discovery', SocialConnectionController.getDiscoveryRecommendations);

export default router;
