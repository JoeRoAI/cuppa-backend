/**
 * activity-feed.service.ts
 * Service for managing activity feeds including activity recording, feed generation,
 * and feed presentation with caching strategies.
 */

import { Activity, IActivity, ActivityType } from '../models/activity.model';
import { SocialConnection } from '../models/social-connection.model';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';

// Cache configuration (TTL: 15 minutes)
const activityFeedCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

class ActivityFeedService {
  /**
   * Records a new activity event
   */
  async recordActivity(
    userId: string,
    activityType: ActivityType,
    options: {
      targetId?: string;
      targetType?: string;
      targetUserId?: string;
      content?: string;
      metadata?: Record<string, any>;
      visibility?: 'public' | 'followers' | 'private';
    }
  ): Promise<IActivity> {
    try {
      // Create activity document
      const activity = new Activity({
        userId: new mongoose.Types.ObjectId(userId),
        activityType,
        targetId: options.targetId ? new mongoose.Types.ObjectId(options.targetId) : undefined,
        targetType: options.targetType,
        targetUserId: options.targetUserId
          ? new mongoose.Types.ObjectId(options.targetUserId)
          : undefined,
        content: options.content,
        metadata: options.metadata,
        visibility: options.visibility || 'public',
      });

      // Save to database
      await activity.save();

      // Invalidate cache for this user and their followers
      this.invalidateUserFeedCache(userId);

      // If target is another user (for follow events), invalidate their cache too
      if (options.targetUserId) {
        this.invalidateUserFeedCache(options.targetUserId);
      }

      return activity;
    } catch (error) {
      console.error('Error recording activity:', error);
      throw error;
    }
  }

  /**
   * Invalidates feed cache for a user and their followers
   */
  private async invalidateUserFeedCache(userId: string): Promise<void> {
    // Invalidate user's own feed cache
    activityFeedCache.del(`feed_${userId}`);

    // Find all followers and invalidate their caches
    try {
      const followers = await SocialConnection.find({
        followedId: new mongoose.Types.ObjectId(userId),
        status: 'active',
      }).select('followerId');

      for (const follower of followers) {
        activityFeedCache.del(`feed_${follower.followerId}`);
      }
    } catch (error) {
      console.error('Error invalidating follower feed caches:', error);
    }
  }

  /**
   * Gets a personalized activity feed for a user
   */
  async getUserFeed(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      activityTypes?: ActivityType[];
    } = {}
  ): Promise<{
    activities: IActivity[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    // Try to get from cache first
    const cacheKey = `feed_${userId}_${page}_${limit}_${options.activityTypes?.join('_') || 'all'}`;
    const cachedFeed = activityFeedCache.get(cacheKey);

    if (cachedFeed) {
      return cachedFeed as {
        activities: IActivity[];
        totalCount: number;
        hasMore: boolean;
      };
    }

    try {
      // Find all users this user follows
      const followedUsers = await SocialConnection.find({
        followerId: new mongoose.Types.ObjectId(userId),
        status: 'active',
      }).select('followedId');

      // Get IDs of followed users
      const followedIds = followedUsers.map((f) => f.followedId);

      // Add user's own ID to include their activities
      followedIds.push(new mongoose.Types.ObjectId(userId));

      // Build the query
      const query: any = {
        $or: [
          // Activities from followed users that are public or for followers
          {
            userId: { $in: followedIds },
            visibility: { $in: ['public', 'followers'] },
            isDeleted: false,
          },
          // Activities where this user is the target
          {
            targetUserId: new mongoose.Types.ObjectId(userId),
            isDeleted: false,
          },
        ],
      };

      // Filter by activity type if specified
      if (options.activityTypes && options.activityTypes.length > 0) {
        query.activityType = { $in: options.activityTypes };
      }

      // Execute count query for pagination
      const totalCount = await Activity.countDocuments(query);

      // Get activities with pagination
      const activities = await Activity.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name socialProfile.avatar')
        .populate('targetUserId', 'name socialProfile.avatar');

      const result = {
        activities,
        totalCount,
        hasMore: totalCount > skip + limit,
      };

      // Store in cache
      activityFeedCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error generating user feed:', error);
      throw error;
    }
  }

  /**
   * Gets activities for a specific user's profile
   */
  async getUserProfileActivities(
    profileUserId: string,
    viewerUserId: string | null,
    options: {
      page?: number;
      limit?: number;
      activityTypes?: ActivityType[];
    } = {}
  ): Promise<{
    activities: IActivity[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    try {
      // Determine visibility level based on relationship
      let visibilityLevel: ('public' | 'followers' | 'private')[] = ['public'];

      if (viewerUserId) {
        if (viewerUserId === profileUserId) {
          // User viewing their own profile - show all activities
          visibilityLevel = ['public', 'followers', 'private'];
        } else {
          // Check if viewer follows the profile user
          const isFollowing = await SocialConnection.findOne({
            followerId: new mongoose.Types.ObjectId(viewerUserId),
            followedId: new mongoose.Types.ObjectId(profileUserId),
            status: 'active',
          });

          if (isFollowing) {
            visibilityLevel = ['public', 'followers'];
          }
        }
      }

      // Build query
      const query: any = {
        userId: new mongoose.Types.ObjectId(profileUserId),
        visibility: { $in: visibilityLevel },
        isDeleted: false,
      };

      // Filter by activity type if specified
      if (options.activityTypes && options.activityTypes.length > 0) {
        query.activityType = { $in: options.activityTypes };
      }

      // Execute count query for pagination
      const totalCount = await Activity.countDocuments(query);

      // Get activities with pagination
      const activities = await Activity.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name socialProfile.avatar')
        .populate('targetUserId', 'name socialProfile.avatar');

      return {
        activities,
        totalCount,
        hasMore: totalCount > skip + limit,
      };
    } catch (error) {
      console.error('Error getting user profile activities:', error);
      throw error;
    }
  }

  /**
   * Deletes an activity (soft delete)
   */
  async deleteActivity(activityId: string, userId: string): Promise<boolean> {
    try {
      const activity = await Activity.findById(activityId);

      if (!activity) {
        throw new Error('Activity not found');
      }

      // Check if user owns the activity
      if (activity.userId.toString() !== userId) {
        throw new Error('Unauthorized to delete this activity');
      }

      // Soft delete
      activity.isDeleted = true;
      await activity.save();

      // Invalidate cache
      this.invalidateUserFeedCache(userId);

      return true;
    } catch (error) {
      console.error('Error deleting activity:', error);
      throw error;
    }
  }

  /**
   * Gets activity statistics for a user
   */
  async getUserActivityStats(userId: string): Promise<Record<ActivityType, number>> {
    try {
      const stats = await Activity.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$activityType',
            count: { $sum: 1 },
          },
        },
      ]);

      // Initialize all activity types with 0
      const result: Record<ActivityType, number> = {
        follow: 0,
        like: 0,
        comment: 0,
        review: 0,
        checkin: 0,
        share: 0,
        recommendation: 0,
        badge_earned: 0,
        profile_update: 0,
      };

      // Fill in actual counts
      stats.forEach((stat) => {
        result[stat._id as ActivityType] = stat.count;
      });

      return result;
    } catch (error) {
      console.error('Error getting user activity stats:', error);
      throw error;
    }
  }
}

export default new ActivityFeedService();
