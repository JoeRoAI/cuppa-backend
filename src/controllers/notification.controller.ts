import { Request, Response } from 'express';
import mongoose from 'mongoose';
import NotificationService from '../services/notification.service';
import logger from '../utils/logger';

class NotificationController {
  /**
   * Get notifications for the authenticated user
   * GET /api/notifications
   */
  async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      const {
        page = 1,
        limit = 20,
        type,
        isRead,
        priority,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      // Build filters
      const filters: any = {};
      if (type) {
        if (typeof type === 'string' && type.includes(',')) {
          filters.type = type.split(',');
        } else {
          filters.type = type;
        }
      }
      if (isRead !== undefined) {
        filters.isRead = isRead === 'true';
      }
      if (priority) {
        filters.priority = priority;
      }

      // Build options with proper typing
      const validSortBy = ['createdAt', 'priority', 'type'].includes(sortBy as string) 
        ? (sortBy as 'createdAt' | 'priority' | 'type') 
        : 'createdAt';

      const options = {
        page: parseInt(page as string),
        limit: Math.min(parseInt(limit as string), 100), // Max 100 per page
        sortBy: validSortBy,
        sortOrder: sortOrder as 'asc' | 'desc',
      };

      const result = await NotificationService.getNotifications(userId, filters, options);

      res.json({
        success: true,
        data: result,
      });

    } catch (error) {
      logger.error('Error getting notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notifications',
      });
    }
  }

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      const count = await NotificationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { count },
      });

    } catch (error) {
      logger.error('Error getting unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
      });
    }
  }

  /**
   * Get notification statistics
   * GET /api/notifications/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      const stats = await NotificationService.getNotificationStats(userId);

      res.json({
        success: true,
        data: stats,
      });

    } catch (error) {
      logger.error('Error getting notification stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification statistics',
      });
    }
  }

  /**
   * Mark notification as read
   * PATCH /api/notifications/:id/read
   */
  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      const notificationId = new mongoose.Types.ObjectId(req.params.id);

      const success = await NotificationService.markAsRead(notificationId, userId);

      if (success) {
        res.json({
          success: true,
          message: 'Notification marked as read',
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Notification not found',
        });
      }

    } catch (error) {
      logger.error('Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
      });
    }
  }

  /**
   * Mark all notifications as read
   * PATCH /api/notifications/read-all
   */
  async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      const count = await NotificationService.markAllAsRead(userId);

      res.json({
        success: true,
        message: `${count} notifications marked as read`,
        data: { count },
      });

    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
      });
    }
  }

  /**
   * Delete notification
   * DELETE /api/notifications/:id
   */
  async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      const notificationId = new mongoose.Types.ObjectId(req.params.id);

      const success = await NotificationService.deleteNotification(notificationId, userId);

      if (success) {
        res.json({
          success: true,
          message: 'Notification deleted',
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Notification not found',
        });
      }

    } catch (error) {
      logger.error('Error deleting notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
      });
    }
  }

  /**
   * Create test notification (development only)
   * POST /api/notifications/test
   */
  async createTestNotification(req: Request, res: Response): Promise<void> {
    try {
      // Only allow in development
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({
          success: false,
          message: 'Test notifications not allowed in production',
        });
        return;
      }

      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      const userId = new mongoose.Types.ObjectId(req.user.id);
      const { type = 'achievement', title = 'Test Notification', message = 'This is a test notification' } = req.body;

      const notification = await NotificationService.createNotification({
        userId,
        type,
        title,
        message,
        priority: 'medium',
      });

      res.json({
        success: true,
        message: 'Test notification created',
        data: notification,
      });

    } catch (error) {
      logger.error('Error creating test notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create test notification',
      });
    }
  }
}

export default new NotificationController(); 