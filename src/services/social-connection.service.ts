/**
 * social-connection.service.ts
 * Service for managing social connections between users
 */

import mongoose from 'mongoose';
import { SocialConnection, ISocialConnection } from '../models/social-connection.model';
import logger from '../utils/logger';

class SocialConnectionService {
  /**
   * Follow a user
   * @param followerId The ID of the user who is following
   * @param followedId The ID of the user being followed
   * @returns The created or updated connection
   */
  async followUser(followerId: string, followedId: string): Promise<ISocialConnection> {
    try {
      if (followerId === followedId) {
        throw new Error('Users cannot follow themselves');
      }

      // Check if the connection already exists
      let connection = await SocialConnection.findOne({
        followerId: new mongoose.Types.ObjectId(followerId),
        followedId: new mongoose.Types.ObjectId(followedId),
      });

      if (connection) {
        // If connection exists but is not active, reactivate it
        if (connection.status !== 'active') {
          connection.status = 'active';
          connection.lastInteractionDate = new Date();
          connection.interactionCount += 1;
          await connection.save();
        }
        return connection;
      }

      // Create new connection
      connection = new SocialConnection({
        followerId: new mongoose.Types.ObjectId(followerId),
        followedId: new mongoose.Types.ObjectId(followedId),
        status: 'active',
        strength: 0.1, // Initial connection strength
        interactionCount: 1,
        lastInteractionDate: new Date(),
        interactionTypes: {
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
        },
      });

      await connection.save();
      return connection;
    } catch (error) {
      logger.error('Error following user:', error);
      throw error;
    }
  }

  /**
   * Unfollow a user (set connection to inactive)
   * @param followerId The ID of the user who is unfollowing
   * @param followedId The ID of the user being unfollowed
   * @returns True if successful
   */
  async unfollowUser(followerId: string, followedId: string): Promise<boolean> {
    try {
      const result = await SocialConnection.updateOne(
        {
          followerId: new mongoose.Types.ObjectId(followerId),
          followedId: new mongoose.Types.ObjectId(followedId),
        },
        {
          status: 'inactive',
          $set: { lastInteractionDate: new Date() },
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      logger.error('Error unfollowing user:', error);
      throw error;
    }
  }

  /**
   * Block a user
   * @param userId The ID of the user blocking
   * @param blockedId The ID of the user being blocked
   * @returns True if successful
   */
  async blockUser(userId: string, blockedId: string): Promise<boolean> {
    try {
      // First, block the user if they are following you
      const blockFollower = await SocialConnection.updateOne(
        {
          followerId: new mongoose.Types.ObjectId(blockedId),
          followedId: new mongoose.Types.ObjectId(userId),
        },
        {
          status: 'blocked',
          $set: { lastInteractionDate: new Date() },
        }
      );

      // Second, block if you are following them
      const blockFollowing = await SocialConnection.updateOne(
        {
          followerId: new mongoose.Types.ObjectId(userId),
          followedId: new mongoose.Types.ObjectId(blockedId),
        },
        {
          status: 'blocked',
          $set: { lastInteractionDate: new Date() },
        }
      );

      return blockFollower.modifiedCount > 0 || blockFollowing.modifiedCount > 0;
    } catch (error) {
      logger.error('Error blocking user:', error);
      throw error;
    }
  }

  /**
   * Get followers of a user
   * @param userId The ID of the user
   * @param limit The maximum number of followers to return
   * @param skip The number of followers to skip (for pagination)
   * @returns Array of user IDs who follow the specified user
   */
  async getFollowers(userId: string, limit = 20, skip = 0): Promise<string[]> {
    try {
      const connections = await SocialConnection.find({
        followedId: new mongoose.Types.ObjectId(userId),
        status: 'active',
      })
        .sort({ strength: -1 })
        .skip(skip)
        .limit(limit)
        .select('followerId')
        .lean();

      return connections.map((c) => c.followerId.toString());
    } catch (error) {
      logger.error('Error getting followers:', error);
      throw error;
    }
  }

  /**
   * Get users followed by a user
   * @param userId The ID of the user
   * @param limit The maximum number of followed users to return
   * @param skip The number of followed users to skip (for pagination)
   * @returns Array of user IDs who are followed by the specified user
   */
  async getFollowing(userId: string, limit = 20, skip = 0): Promise<string[]> {
    try {
      const connections = await SocialConnection.find({
        followerId: new mongoose.Types.ObjectId(userId),
        status: 'active',
      })
        .sort({ strength: -1 })
        .skip(skip)
        .limit(limit)
        .select('followedId')
        .lean();

      return connections.map((c) => c.followedId.toString());
    } catch (error) {
      logger.error('Error getting following:', error);
      throw error;
    }
  }

  /**
   * Check if a user follows another user
   * @param followerId The ID of the potential follower
   * @param followedId The ID of the potentially followed user
   * @returns True if the follower follows the followed user
   */
  async isFollowing(followerId: string, followedId: string): Promise<boolean> {
    try {
      const connection = await SocialConnection.findOne({
        followerId: new mongoose.Types.ObjectId(followerId),
        followedId: new mongoose.Types.ObjectId(followedId),
        status: 'active',
      });

      return !!connection;
    } catch (error) {
      logger.error('Error checking follow status:', error);
      throw error;
    }
  }

  /**
   * Record a social interaction between users
   * @param actorId The ID of the user performing the action
   * @param targetId The ID of the user receiving the action
   * @param interactionType The type of interaction (like, comment, share, view)
   * @returns The updated connection with new strength
   */
  async recordInteraction(
    actorId: string,
    targetId: string,
    interactionType: 'likes' | 'comments' | 'shares' | 'views'
  ): Promise<ISocialConnection | null> {
    try {
      // Check if there's an existing connection
      let connection = await SocialConnection.findOne({
        followerId: new mongoose.Types.ObjectId(actorId),
        followedId: new mongoose.Types.ObjectId(targetId),
      });

      if (!connection) {
        // If no connection, create an implicit one (e.g., user interacted but wasn't following)
        connection = new SocialConnection({
          followerId: new mongoose.Types.ObjectId(actorId),
          followedId: new mongoose.Types.ObjectId(targetId),
          status: 'active',
          strength: 0.05, // Lower initial strength for implicit connections
          interactionCount: 0,
          interactionTypes: {
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
          },
        });
      }

      // Update interaction statistics
      connection.interactionCount += 1;
      connection.lastInteractionDate = new Date();

      // Increment the specific interaction type
      if (!connection.interactionTypes) {
        connection.interactionTypes = {
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
        };
      }
      connection.interactionTypes[interactionType] += 1;

      // Update connection strength
      connection.updateStrength();

      await connection.save();
      return connection;
    } catch (error) {
      logger.error('Error recording social interaction:', error);
      throw error;
    }
  }

  /**
   * Get connection statistics for a user
   * @param userId The ID of the user
   * @returns Statistics about the user's connections
   */
  async getConnectionStats(userId: string): Promise<{
    followerCount: number;
    followingCount: number;
    mostActiveFollowers: any[];
    mostActiveFollowing: any[];
  }> {
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Get counts
      const followerCount = await SocialConnection.countDocuments({
        followedId: userObjectId,
        status: 'active',
      });

      const followingCount = await SocialConnection.countDocuments({
        followerId: userObjectId,
        status: 'active',
      });

      // Get most active followers (highest strength)
      const mostActiveFollowers = await SocialConnection.find({
        followedId: userObjectId,
        status: 'active',
      })
        .sort({ strength: -1 })
        .limit(5)
        .populate('followerId', 'name')
        .lean();

      // Get most active following (highest strength)
      const mostActiveFollowing = await SocialConnection.find({
        followerId: userObjectId,
        status: 'active',
      })
        .sort({ strength: -1 })
        .limit(5)
        .populate('followedId', 'name')
        .lean();

      return {
        followerCount,
        followingCount,
        mostActiveFollowers,
        mostActiveFollowing,
      };
    } catch (error) {
      logger.error('Error getting connection stats:', error);
      throw error;
    }
  }

  /**
   * Get suggested users to follow based on mutual connections
   * @param userId The ID of the user
   * @param limit The maximum number of suggestions to return
   * @returns Array of suggested user IDs
   */
  async getSuggestedUsers(userId: string, limit = 10): Promise<string[]> {
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Get users that the current user follows
      const following = await SocialConnection.find({
        followerId: userObjectId,
        status: 'active',
      })
        .select('followedId')
        .lean();

      if (following.length === 0) {
        // If user doesn't follow anyone, return popular users
        return this.getPopularUsers(limit);
      }

      const followingIds = following.map((f) => f.followedId);

      // Find users that are followed by users that the current user follows
      // (friends of friends)
      const suggestedUsers = await SocialConnection.aggregate([
        // Match connections where the follower is someone the user follows
        {
          $match: {
            followerId: { $in: followingIds },
            status: 'active',
            // Exclude users that the current user already follows
            followedId: { $ne: userObjectId },
          },
        },
        // Group by followed user to count how many mutual connections
        {
          $group: {
            _id: '$followedId',
            mutualCount: { $sum: 1 },
          },
        },
        // Sort by number of mutual connections
        { $sort: { mutualCount: -1 } },
        { $limit: limit },
      ]);

      // Convert and return just the user IDs
      return suggestedUsers.map((u) => u._id.toString());
    } catch (error) {
      logger.error('Error getting suggested users:', error);
      throw error;
    }
  }

  /**
   * Get popular users based on follower count
   * @param limit The maximum number of users to return
   * @returns Array of popular user IDs
   */
  private async getPopularUsers(limit = 10): Promise<string[]> {
    try {
      // Count followers per user
      const popularUsers = await SocialConnection.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: '$followedId',
            followerCount: { $sum: 1 },
          },
        },
        { $sort: { followerCount: -1 } },
        { $limit: limit },
      ]);

      return popularUsers.map((u) => u._id.toString());
    } catch (error) {
      logger.error('Error getting popular users:', error);
      throw error;
    }
  }
}

export default new SocialConnectionService();
