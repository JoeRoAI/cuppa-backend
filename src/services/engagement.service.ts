/**
 * engagement.service.ts
 * Service for managing user engagement features like likes and comments.
 */

import { Like, ILike } from '../models/like.model';
import { Comment, IComment } from '../models/comment.model';
import ActivityFeedService from './activity-feed.service';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';

// Cache configuration (TTL: 5 minutes)
const engagementCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

class EngagementService {
  /**
   * Toggles a like for a user on a specific content
   */
  async toggleLike(
    userId: string,
    targetId: string,
    targetType: 'Coffee' | 'Review' | 'Comment'
  ): Promise<{ liked: boolean; count: number }> {
    try {
      // Find existing like
      const existingLike = await Like.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        targetId: new mongoose.Types.ObjectId(targetId),
        targetType,
      });

      if (existingLike) {
        // Toggle like status
        existingLike.isActive = !existingLike.isActive;
        await existingLike.save();

        // Record activity only if it's a new like (not an unlike)
        if (existingLike.isActive) {
          await this.recordLikeActivity(userId, targetId, targetType);
        }

        // Get updated count
        const count = await this.getLikeCount(targetId, targetType);

        // Update cached like count for comments
        if (targetType === 'Comment') {
          await this.updateCommentLikeCount(targetId, count);
        }

        return { liked: existingLike.isActive, count };
      } else {
        // Create new like
        const newLike = new Like({
          userId: new mongoose.Types.ObjectId(userId),
          targetId: new mongoose.Types.ObjectId(targetId),
          targetType,
        });

        await newLike.save();

        // Record activity
        await this.recordLikeActivity(userId, targetId, targetType);

        // Get updated count
        const count = await this.getLikeCount(targetId, targetType);

        // Update cached like count for comments
        if (targetType === 'Comment') {
          await this.updateCommentLikeCount(targetId, count);
        }

        return { liked: true, count };
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      throw error;
    }
  }

  /**
   * Gets the like count for a specific content
   */
  async getLikeCount(targetId: string, targetType: string): Promise<number> {
    const cacheKey = `like_count_${targetType}_${targetId}`;
    const cachedCount = engagementCache.get(cacheKey);

    if (cachedCount !== undefined) {
      return cachedCount as number;
    }

    try {
      const count = await Like.countDocuments({
        targetId: new mongoose.Types.ObjectId(targetId),
        targetType,
        isActive: true,
      });

      // Cache the result
      engagementCache.set(cacheKey, count);

      return count;
    } catch (error) {
      console.error('Error getting like count:', error);
      throw error;
    }
  }

  /**
   * Updates the cached like count for a comment
   */
  private async updateCommentLikeCount(commentId: string, count: number): Promise<void> {
    try {
      await Comment.findByIdAndUpdate(commentId, { likeCount: count }, { new: true });
    } catch (error) {
      console.error('Error updating comment like count:', error);
    }
  }

  /**
   * Checks if a user has liked a specific content
   */
  async hasUserLiked(userId: string, targetId: string, targetType: string): Promise<boolean> {
    try {
      const like = await Like.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        targetId: new mongoose.Types.ObjectId(targetId),
        targetType,
        isActive: true,
      });

      return !!like;
    } catch (error) {
      console.error('Error checking if user liked content:', error);
      throw error;
    }
  }

  /**
   * Records a like activity in the activity feed
   */
  private async recordLikeActivity(
    userId: string,
    targetId: string,
    targetType: string
  ): Promise<void> {
    try {
      // Get target user ID based on target type
      const metadata: Record<string, any> = { targetType };

      // Record activity
      await ActivityFeedService.recordActivity(userId, 'like', {
        targetId,
        targetType,
        content: '',
        metadata,
        visibility: 'public',
      });
    } catch (error) {
      console.error('Error recording like activity:', error);
    }
  }

  /**
   * Creates a new comment
   */
  async createComment(
    userId: string,
    content: string,
    targetId: string,
    targetType: 'Coffee' | 'Review',
    parentId?: string
  ): Promise<IComment> {
    try {
      // Create comment
      const comment = new Comment({
        userId: new mongoose.Types.ObjectId(userId),
        content,
        targetId: new mongoose.Types.ObjectId(targetId),
        targetType,
        parentId: parentId ? new mongoose.Types.ObjectId(parentId) : undefined,
        status: 'approved', // Default to approved, can be changed based on moderation needs
      });

      await comment.save();

      // Record activity
      await this.recordCommentActivity(userId, comment._id.toString(), targetId, targetType);

      // Clear cache for comment lists
      this.invalidateCommentCache(targetId, targetType);

      return comment;
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  }

  /**
   * Updates an existing comment
   */
  async updateComment(
    commentId: string,
    userId: string,
    content: string
  ): Promise<IComment | null> {
    try {
      // Find comment and check ownership
      const comment = await Comment.findById(commentId);

      if (!comment) {
        throw new Error('Comment not found');
      }

      if (comment.userId.toString() !== userId) {
        throw new Error('Unauthorized to update this comment');
      }

      if (comment.isDeleted) {
        throw new Error('Cannot update deleted comment');
      }

      // Update comment
      comment.content = content;
      comment.isEdited = true;
      await comment.save();

      // Clear cache
      this.invalidateCommentCache(comment.targetId.toString(), comment.targetType);

      return comment;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  /**
   * Soft deletes a comment
   */
  async deleteComment(
    commentId: string,
    userId: string,
    isAdmin: boolean = false
  ): Promise<boolean> {
    try {
      // Find comment
      const comment = await Comment.findById(commentId);

      if (!comment) {
        throw new Error('Comment not found');
      }

      // Check permissions (allow user who created the comment or admins)
      if (!isAdmin && comment.userId.toString() !== userId) {
        throw new Error('Unauthorized to delete this comment');
      }

      // Soft delete
      comment.isDeleted = true;
      await comment.save();

      // Clear cache
      this.invalidateCommentCache(comment.targetId.toString(), comment.targetType);

      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  /**
   * Gets comments for a specific content
   */
  async getComments(
    targetId: string,
    targetType: string,
    options: {
      page?: number;
      limit?: number;
      parentId?: string | null;
      sort?: 'newest' | 'oldest' | 'mostLiked';
    } = {}
  ): Promise<{
    comments: IComment[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const { page = 1, limit = 20, parentId = null, sort = 'newest' } = options;

    const skip = (page - 1) * limit;

    // Create cache key
    const cacheKey = `comments_${targetType}_${targetId}_${page}_${limit}_${parentId || 'root'}_${sort}`;
    const cachedComments = engagementCache.get(cacheKey);

    if (cachedComments) {
      return cachedComments as {
        comments: IComment[];
        totalCount: number;
        hasMore: boolean;
      };
    }

    try {
      // Build query
      const query: any = {
        targetId: new mongoose.Types.ObjectId(targetId),
        targetType,
        isDeleted: false,
        status: 'approved',
      };

      // Filter by parent (null for root comments, specific ID for replies)
      if (parentId === null) {
        query.parentId = { $exists: false };
      } else if (parentId) {
        query.parentId = new mongoose.Types.ObjectId(parentId);
      }

      // Count total for pagination
      const totalCount = await Comment.countDocuments(query);

      // Determine sort order
      let sortOptions: any = {};
      switch (sort) {
        case 'oldest':
          sortOptions = { createdAt: 1 };
          break;
        case 'mostLiked':
          sortOptions = { likeCount: -1, createdAt: -1 };
          break;
        case 'newest':
        default:
          sortOptions = { createdAt: -1 };
      }

      // Get comments
      const comments = await Comment.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name socialProfile.avatar')
        .populate('parentId');

      const result = {
        comments,
        totalCount,
        hasMore: totalCount > skip + limit,
      };

      // Cache result
      engagementCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error getting comments:', error);
      throw error;
    }
  }

  /**
   * Gets reply count for a comment
   */
  async getReplyCount(commentId: string): Promise<number> {
    const cacheKey = `reply_count_${commentId}`;
    const cachedCount = engagementCache.get(cacheKey);

    if (cachedCount !== undefined) {
      return cachedCount as number;
    }

    try {
      const count = await Comment.countDocuments({
        parentId: new mongoose.Types.ObjectId(commentId),
        isDeleted: false,
        status: 'approved',
      });

      // Cache the result
      engagementCache.set(cacheKey, count);

      return count;
    } catch (error) {
      console.error('Error getting reply count:', error);
      throw error;
    }
  }

  /**
   * Records a comment activity in the activity feed
   */
  private async recordCommentActivity(
    userId: string,
    commentId: string,
    targetId: string,
    targetType: string
  ): Promise<void> {
    try {
      // Record activity
      await ActivityFeedService.recordActivity(userId, 'comment', {
        targetId,
        targetType,
        content: '',
        metadata: { commentId },
        visibility: 'public',
      });
    } catch (error) {
      console.error('Error recording comment activity:', error);
    }
  }

  /**
   * Invalidates comment cache for a target
   */
  private invalidateCommentCache(targetId: string, targetType: string): void {
    // Clear all cached comment lists for this target
    const keys = engagementCache.keys();
    const targetKeys = keys.filter((key) => key.startsWith(`comments_${targetType}_${targetId}_`));

    targetKeys.forEach((key) => {
      engagementCache.del(key);
    });
  }

  /**
   * Moderates a comment (admin function)
   */
  async moderateComment(
    commentId: string,
    status: 'approved' | 'pending' | 'spam' | 'rejected',
    adminUserId: string
  ): Promise<IComment | null> {
    try {
      const comment = await Comment.findById(commentId);

      if (!comment) {
        throw new Error('Comment not found');
      }

      // Update status
      comment.status = status;
      await comment.save();

      // Clear cache
      this.invalidateCommentCache(comment.targetId.toString(), comment.targetType);

      return comment;
    } catch (error) {
      console.error('Error moderating comment:', error);
      throw error;
    }
  }
}

export default new EngagementService();
