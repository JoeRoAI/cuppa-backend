/**
 * activity-feed.controller.ts
 * Controller for activity feed functionality, exposing endpoints for
 * retrieving personalized feeds and managing activity events.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ActivityFeedService from '../services/activity-feed.service';
import { ActivityType } from '../models/activity.model';

// Extend Request type to include user
interface AuthenticatedRequest extends Request {
  user?: any;
}

class ActivityFeedController {
  /**
   * Get the current user's activity feed
   * @route GET /api/activity-feed
   */
  async getFeed(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      
      // If user is not authenticated, return mock activity data
      if (!userId) {
        const mockActivities = [
          {
            _id: 'activity1',
            userId: 'user1',
            activityType: 'coffee_review',
            content: 'Loved this Ethiopian Yirgacheffe! Amazing floral notes.',
            targetId: 'coffee1',
            targetType: 'coffee',
            user: {
              _id: 'user1',
              username: 'coffee_lover_23',
              profilePicture: '/images/user-placeholder.jpg'
            },
            target: {
              _id: 'coffee1',
              name: 'Ethiopian Yirgacheffe',
              brand: 'Blue Bottle Coffee'
            },
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
          },
          {
            _id: 'activity2',
            userId: 'user2',
            activityType: 'coffee_checkin',
            content: 'Starting my morning with this amazing Colombian blend!',
            targetId: 'coffee2',
            targetType: 'coffee',
            user: {
              _id: 'user2',
              username: 'morning_brew',
              profilePicture: '/images/user-placeholder.jpg'
            },
            target: {
              _id: 'coffee2',
              name: 'Colombian Supremo',
              brand: 'Stumptown Coffee'
            },
            createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
            updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000)
          },
          {
            _id: 'activity3',
            userId: 'user3',
            activityType: 'coffee_rating',
            content: 'Rated this coffee 5 stars - absolutely perfect!',
            targetId: 'coffee3',
            targetType: 'coffee',
            user: {
              _id: 'user3',
              username: 'espresso_expert',
              profilePicture: '/images/user-placeholder.jpg'
            },
            target: {
              _id: 'coffee3',
              name: 'House Blend',
              brand: 'Intelligentsia Coffee'
            },
            createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
            updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000)
          }
        ];

        res.status(200).json({
          success: true,
          data: mockActivities,
          pagination: {
            total: mockActivities.length,
            page: 1,
            limit: 20,
            hasMore: false
          }
        });
        return;
      }
      
      // Get query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const activityTypes = req.query.types as string;
      
      // Parse activity types if provided
      let activityTypeList: ActivityType[] | undefined;
      if (activityTypes) {
        activityTypeList = activityTypes.split(',') as ActivityType[];
      }
      
      const feed = await ActivityFeedService.getUserFeed(userId, {
        page,
        limit,
        activityTypes: activityTypeList
      });
      
      res.status(200).json({
        success: true,
        data: feed.activities,
        pagination: {
          total: feed.totalCount,
          page,
          limit,
          hasMore: feed.hasMore
        }
      });
    } catch (error) {
      console.error('Error fetching feed:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching activity feed',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Get activity feed for a specific user's profile
   * @route GET /api/activity-feed/user/:userId
   */
  async getUserProfileFeed(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const profileUserId = req.params.userId;
      const viewerUserId = req.user?.id || null;
      
      // Parameter validation
      if (!mongoose.Types.ObjectId.isValid(profileUserId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID format' });
        return;
      }
      
      // Get query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const activityTypes = req.query.types as string;
      
      // Parse activity types if provided
      let activityTypeList: ActivityType[] | undefined;
      if (activityTypes) {
        activityTypeList = activityTypes.split(',') as ActivityType[];
      }
      
      const activities = await ActivityFeedService.getUserProfileActivities(
        profileUserId,
        viewerUserId,
        {
          page,
          limit,
          activityTypes: activityTypeList
        }
      );
      
      res.status(200).json({
        success: true,
        data: activities.activities,
        pagination: {
          total: activities.totalCount,
          page,
          limit,
          hasMore: activities.hasMore
        }
      });
    } catch (error) {
      console.error('Error fetching user profile feed:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user profile activity feed',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Record a new activity
   * @route POST /api/activity-feed/activity
   */
  async createActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      const {
        activityType,
        targetId,
        targetType,
        targetUserId,
        content,
        metadata,
        visibility
      } = req.body;
      
      // Validate required fields
      if (!activityType) {
        res.status(400).json({ success: false, message: 'Activity type is required' });
        return;
      }
      
      // Create activity
      const activity = await ActivityFeedService.recordActivity(
        userId,
        activityType,
        {
          targetId,
          targetType,
          targetUserId,
          content,
          metadata,
          visibility
        }
      );
      
      res.status(201).json({
        success: true,
        data: activity
      });
    } catch (error) {
      console.error('Error creating activity:', error);
      res.status(500).json({
        success: false,
        message: 'Error recording activity',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Delete an activity
   * @route DELETE /api/activity-feed/activity/:activityId
   */
  async deleteActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const activityId = req.params.activityId;
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      // Parameter validation
      if (!mongoose.Types.ObjectId.isValid(activityId)) {
        res.status(400).json({ success: false, message: 'Invalid activity ID format' });
        return;
      }
      
      // Delete activity
      await ActivityFeedService.deleteActivity(activityId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Activity deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting activity:', error);
      
      // Specific error handling
      if ((error as Error).message === 'Activity not found') {
        res.status(404).json({
          success: false,
          message: 'Activity not found'
        });
        return;
      } else if ((error as Error).message === 'Unauthorized to delete this activity') {
        res.status(403).json({
          success: false,
          message: 'You are not authorized to delete this activity'
        });
        return;
      }
      
      // Generic error
      res.status(500).json({
        success: false,
        message: 'Error deleting activity',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Get activity statistics for a user
   * @route GET /api/activity-feed/stats/:userId?
   */
  async getActivityStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const requestedUserId = req.params.userId;
      const currentUserId = req.user?.id;
      
      if (!currentUserId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      // If no userId is provided, use the current user's ID
      const targetUserId = requestedUserId || currentUserId;
      
      // Parameter validation if userId is provided
      if (requestedUserId && !mongoose.Types.ObjectId.isValid(requestedUserId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID format' });
        return;
      }
      
      // Get stats
      const stats = await ActivityFeedService.getUserActivityStats(targetUserId);
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching activity stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving activity statistics',
        error: (error as Error).message
      });
    }
  }
}

export default new ActivityFeedController(); 