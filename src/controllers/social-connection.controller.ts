/**
 * social-connection.controller.ts
 * Controller for managing social connections between users and recommendations
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SocialConnectionService from '../services/social-connection.service';
import RecommendationEngine from '../RecommendationEngine';
import logger from '../utils/logger';

// Define interface for user in request object
declare global {
  namespace Express {
    interface User {
      id: string;
      name: string;
      email: string;
      role: string;
    }
  }
}

class SocialConnectionController {
  /**
   * Follow a user
   * @route POST /api/social/follow/:userId
   */
  async followUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const followerId = req.user?.id;

      if (!followerId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        });
        return;
      }

      if (followerId === userId) {
        res.status(400).json({
          success: false,
          message: 'Cannot follow yourself',
        });
        return;
      }

      const connection = await SocialConnectionService.followUser(followerId, userId);

      res.status(200).json({
        success: true,
        message: 'User followed successfully',
        data: {
          followerId,
          followedId: userId,
          status: connection.status,
        },
      });
    } catch (error) {
      logger.error('Error in followUser controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error following user',
      });
    }
  }

  /**
   * Unfollow a user
   * @route POST /api/social/unfollow/:userId
   */
  async unfollowUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const followerId = req.user?.id;

      if (!followerId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        });
        return;
      }

      const success = await SocialConnectionService.unfollowUser(followerId, userId);

      if (!success) {
        res.status(400).json({
          success: false,
          message: 'Not following this user',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'User unfollowed successfully',
      });
    } catch (error) {
      logger.error('Error in unfollowUser controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error unfollowing user',
      });
    }
  }

  /**
   * Block a user
   * @route POST /api/social/block/:userId
   */
  async blockUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const blockerId = req.user?.id;

      if (!blockerId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        });
        return;
      }

      const success = await SocialConnectionService.blockUser(blockerId, userId);

      res.status(200).json({
        success: true,
        message: 'User blocked successfully',
      });
    } catch (error) {
      logger.error('Error in blockUser controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error blocking user',
      });
    }
  }

  /**
   * Get followers of the authenticated user
   * @route GET /api/social/followers
   */
  async getFollowers(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 20;
      const page = parseInt(req.query.page as string) || 1;
      const skip = (page - 1) * limit;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const followers = await SocialConnectionService.getFollowers(userId, limit, skip);

      res.status(200).json({
        success: true,
        count: followers.length,
        page,
        limit,
        data: followers,
      });
    } catch (error) {
      logger.error('Error in getFollowers controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting followers',
      });
    }
  }

  /**
   * Get users that the authenticated user is following
   * @route GET /api/social/following
   */
  async getFollowing(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 20;
      const page = parseInt(req.query.page as string) || 1;
      const skip = (page - 1) * limit;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const following = await SocialConnectionService.getFollowing(userId, limit, skip);

      res.status(200).json({
        success: true,
        count: following.length,
        page,
        limit,
        data: following,
      });
    } catch (error) {
      logger.error('Error in getFollowing controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting following',
      });
    }
  }

  /**
   * Check if the authenticated user follows another user
   * @route GET /api/social/is-following/:userId
   */
  async isFollowing(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const followerId = req.user?.id;

      if (!followerId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        });
        return;
      }

      const following = await SocialConnectionService.isFollowing(followerId, userId);

      res.status(200).json({
        success: true,
        isFollowing: following,
      });
    } catch (error) {
      logger.error('Error in isFollowing controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking follow status',
      });
    }
  }

  /**
   * Get suggested users to follow based on social connections
   * @route GET /api/social/suggestions
   */
  async getSuggestedUsers(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const suggestions = await SocialConnectionService.getSuggestedUsers(userId, limit);

      res.status(200).json({
        success: true,
        count: suggestions.length,
        data: suggestions,
      });
    } catch (error) {
      logger.error('Error in getSuggestedUsers controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting suggested users',
      });
    }
  }

  /**
   * Get connection statistics for the authenticated user
   * @route GET /api/social/stats
   */
  async getConnectionStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const stats = await SocialConnectionService.getConnectionStats(userId);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error in getConnectionStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting connection stats',
      });
    }
  }

  /**
   * Get social recommendations (coffees liked by people the user follows)
   * @route GET /api/social/recommendations
   */
  async getSocialRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const recommendations = await RecommendationEngine.generateRecommendations(userId, {
        algorithm: 'social',
        limit,
        includeReasons: true,
        context: {
          source: 'social-recommendations-api',
        },
      });

      res.status(200).json({
        success: true,
        count: recommendations.length,
        data: recommendations,
      });
    } catch (error) {
      logger.error('Error in getSocialRecommendations controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting social recommendations',
      });
    }
  }

  /**
   * Get discovery recommendations (novel, diverse items to explore)
   * @route GET /api/social/discovery
   */
  async getDiscoveryRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const recommendations = await RecommendationEngine.generateRecommendations(userId, {
        algorithm: 'discovery',
        limit,
        includeReasons: true,
        context: {
          source: 'discovery-recommendations-api',
        },
      });

      res.status(200).json({
        success: true,
        count: recommendations.length,
        data: recommendations,
      });
    } catch (error) {
      logger.error('Error in getDiscoveryRecommendations controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting discovery recommendations',
      });
    }
  }
}

export default new SocialConnectionController();
