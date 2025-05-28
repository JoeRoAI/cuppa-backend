/**
 * engagement.controller.ts
 * Controller for handling likes and comments functionality.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import EngagementService from '../services/engagement.service';

// Extend Request type to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role?: string;
    [key: string]: any;
  };
}

class EngagementController {
  /**
   * Toggle a like on a specific content
   * @route POST /api/engagement/like/:targetType/:targetId
   */
  async toggleLike(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { targetType, targetId } = req.params;
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      // Validate parameters
      if (!['Coffee', 'Review', 'Comment'].includes(targetType)) {
        res.status(400).json({ success: false, message: 'Invalid target type' });
        return;
      }
      
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        res.status(400).json({ success: false, message: 'Invalid target ID format' });
        return;
      }
      
      // Toggle like
      const result = await EngagementService.toggleLike(
        userId,
        targetId,
        targetType as 'Coffee' | 'Review' | 'Comment'
      );
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error toggling like:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling like',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Get like count for a specific content
   * @route GET /api/engagement/likes/:targetType/:targetId
   */
  async getLikes(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { targetType, targetId } = req.params;
      const userId = req.user?.id;
      
      // Validate parameters
      if (!['Coffee', 'Review', 'Comment'].includes(targetType)) {
        res.status(400).json({ success: false, message: 'Invalid target type' });
        return;
      }
      
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        res.status(400).json({ success: false, message: 'Invalid target ID format' });
        return;
      }
      
      // Get like count
      const count = await EngagementService.getLikeCount(targetId, targetType);
      
      // Check if user has liked this content
      let userLiked = false;
      if (userId) {
        userLiked = await EngagementService.hasUserLiked(userId, targetId, targetType);
      }
      
      res.status(200).json({
        success: true,
        data: {
          count,
          userLiked
        }
      });
    } catch (error) {
      console.error('Error getting like information:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting like information',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Create a new comment
   * @route POST /api/engagement/comments/:targetType/:targetId
   */
  async createComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { targetType, targetId } = req.params;
      const { content, parentId } = req.body;
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      // Validate parameters
      if (!['Coffee', 'Review'].includes(targetType)) {
        res.status(400).json({ success: false, message: 'Invalid target type' });
        return;
      }
      
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        res.status(400).json({ success: false, message: 'Invalid target ID format' });
        return;
      }
      
      if (!content || content.trim().length === 0) {
        res.status(400).json({ success: false, message: 'Comment content is required' });
        return;
      }
      
      // Validate parent ID if provided
      if (parentId && !mongoose.Types.ObjectId.isValid(parentId)) {
        res.status(400).json({ success: false, message: 'Invalid parent comment ID format' });
        return;
      }
      
      // Create comment
      const comment = await EngagementService.createComment(
        userId,
        content,
        targetId,
        targetType as 'Coffee' | 'Review',
        parentId
      );
      
      res.status(201).json({
        success: true,
        data: comment
      });
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating comment',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Update an existing comment
   * @route PUT /api/engagement/comments/:commentId
   */
  async updateComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { commentId } = req.params;
      const { content } = req.body;
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      // Validate parameters
      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        res.status(400).json({ success: false, message: 'Invalid comment ID format' });
        return;
      }
      
      if (!content || content.trim().length === 0) {
        res.status(400).json({ success: false, message: 'Comment content is required' });
        return;
      }
      
      // Update comment
      const updatedComment = await EngagementService.updateComment(
        commentId,
        userId,
        content
      );
      
      res.status(200).json({
        success: true,
        data: updatedComment
      });
    } catch (error) {
      console.error('Error updating comment:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating comment',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Delete a comment
   * @route DELETE /api/engagement/comments/:commentId
   */
  async deleteComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { commentId } = req.params;
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      // Validate parameters
      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        res.status(400).json({ success: false, message: 'Invalid comment ID format' });
        return;
      }
      
      // Check if user is admin
      const isAdmin = req.user?.role === 'admin';
      
      // Delete comment
      await EngagementService.deleteComment(commentId, userId, isAdmin);
      
      res.status(200).json({
        success: true,
        message: 'Comment deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting comment',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Get comments for a specific content
   * @route GET /api/engagement/comments/:targetType/:targetId
   */
  async getComments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { targetType, targetId } = req.params;
      
      // Validate parameters
      if (!['Coffee', 'Review'].includes(targetType)) {
        res.status(400).json({ success: false, message: 'Invalid target type' });
        return;
      }
      
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        res.status(400).json({ success: false, message: 'Invalid target ID format' });
        return;
      }
      
      // Get query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const sort = (req.query.sort as 'newest' | 'oldest' | 'mostLiked') || 'newest';
      const parentId = req.query.parentId as string | undefined;
      
      // Handle parentId option
      let parentIdOption: string | null = null;
      if (parentId === 'null' || parentId === undefined) {
        parentIdOption = null;
      } else if (parentId && mongoose.Types.ObjectId.isValid(parentId)) {
        parentIdOption = parentId;
      } else if (parentId) {
        res.status(400).json({ success: false, message: 'Invalid parent comment ID format' });
        return;
      }
      
      // Get comments
      const comments = await EngagementService.getComments(
        targetId,
        targetType,
        {
          page,
          limit,
          parentId: parentIdOption,
          sort
        }
      );
      
      res.status(200).json({
        success: true,
        data: comments.comments,
        pagination: {
          total: comments.totalCount,
          page,
          limit,
          hasMore: comments.hasMore
        }
      });
    } catch (error) {
      console.error('Error getting comments:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving comments',
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Moderate a comment (admin only)
   * @route PUT /api/engagement/comments/:commentId/moderate
   */
  async moderateComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { commentId } = req.params;
      const { status } = req.body;
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }
      
      // Check admin role
      if (req.user?.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Only admins can moderate comments' });
        return;
      }
      
      // Validate parameters
      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        res.status(400).json({ success: false, message: 'Invalid comment ID format' });
        return;
      }
      
      if (!['approved', 'pending', 'spam', 'rejected'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }
      
      // Moderate comment
      const moderatedComment = await EngagementService.moderateComment(
        commentId,
        status as 'approved' | 'pending' | 'spam' | 'rejected',
        userId
      );
      
      res.status(200).json({
        success: true,
        data: moderatedComment
      });
    } catch (error) {
      console.error('Error moderating comment:', error);
      res.status(500).json({
        success: false,
        message: 'Error moderating comment',
        error: (error as Error).message
      });
    }
  }
}

export default new EngagementController(); 