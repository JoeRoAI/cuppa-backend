import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import Notification, { INotification } from '../models/notification.model';
import PrivacySettings from '../models/privacy-settings.model';
import User from '../models/user.model';
import logger from '../utils/logger';

export interface NotificationData {
  userId: mongoose.Types.ObjectId;
  type: INotification['type'];
  title: string;
  message: string;
  data?: INotification['data'];
  priority?: INotification['priority'];
  expiresAt?: Date;
}

export interface NotificationFilters {
  userId?: mongoose.Types.ObjectId;
  type?: INotification['type'] | INotification['type'][];
  isRead?: boolean;
  priority?: INotification['priority'];
  startDate?: Date;
  endDate?: Date;
}

export interface NotificationListOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'priority' | 'type';
  sortOrder?: 'asc' | 'desc';
}

class NotificationService extends EventEmitter {
  private static instance: NotificationService;

  constructor() {
    super();
    this.setupCleanupJob();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Create and send a notification
   */
  async createNotification(data: NotificationData): Promise<INotification | null> {
    try {
      // Check if user exists
      const user = await User.findById(data.userId);
      if (!user) {
        logger.warn(`User not found for notification: ${data.userId}`);
        return null;
      }

      // Check privacy settings
      const shouldSend = await this.checkPrivacySettings(data.userId, data.type);
      if (!shouldSend) {
        logger.debug(
          `Notification blocked by privacy settings: ${data.type} for user ${data.userId}`
        );
        return null;
      }

      // Create notification
      const notification = new Notification({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data,
        priority: data.priority || 'medium',
        expiresAt: data.expiresAt,
      });

      await notification.save();

      // Emit event for real-time delivery
      this.emit('notificationCreated', {
        notification: notification.toObject(),
        userId: data.userId,
      });

      logger.debug(`Notification created: ${notification._id} for user ${data.userId}`);
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create notification for social interactions
   */
  async createSocialNotification(params: {
    recipientId: mongoose.Types.ObjectId;
    actorId: mongoose.Types.ObjectId;
    type: 'like' | 'comment' | 'follow';
    targetType?: 'review' | 'checkin' | 'user';
    targetId?: mongoose.Types.ObjectId;
    targetName?: string;
    metadata?: Record<string, any>;
  }): Promise<INotification | null> {
    try {
      // Don't send notification to self
      if (params.recipientId.equals(params.actorId)) {
        return null;
      }

      // Get actor information
      const actor = await User.findById(params.actorId).select('name profileImage');
      if (!actor) {
        logger.warn(`Actor not found for social notification: ${params.actorId}`);
        return null;
      }

      // Generate notification content based on type
      const { title, message } = this.generateSocialNotificationContent(
        params.type,
        actor.name,
        params.targetName,
        params.targetType
      );

      return await this.createNotification({
        userId: params.recipientId,
        type: params.type,
        title,
        message,
        data: {
          targetType: params.targetType,
          targetId: params.targetId,
          targetName: params.targetName,
          actorId: params.actorId,
          actorName: actor.name,
          actorImage: actor.profileImage,
          metadata: params.metadata,
        },
        priority: params.type === 'follow' ? 'high' : 'medium',
      });
    } catch (error) {
      logger.error('Error creating social notification:', error);
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(
    userId: mongoose.Types.ObjectId,
    filters: NotificationFilters = {},
    options: NotificationListOptions = {}
  ): Promise<{
    notifications: INotification[];
    total: number;
    unreadCount: number;
    hasMore: boolean;
  }> {
    try {
      const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options;

      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      // Build query
      const query: any = { userId };

      if (filters.type) {
        if (Array.isArray(filters.type)) {
          query.type = { $in: filters.type };
        } else {
          query.type = filters.type;
        }
      }

      if (filters.isRead !== undefined) {
        query.isRead = filters.isRead;
      }

      if (filters.priority) {
        query.priority = filters.priority;
      }

      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = filters.startDate;
        if (filters.endDate) query.createdAt.$lte = filters.endDate;
      }

      // Execute queries
      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments(query),
        Notification.countDocuments({ userId, isRead: false }),
      ]);

      const hasMore = skip + notifications.length < total;

      return {
        notifications: notifications as INotification[],
        total,
        unreadCount,
        hasMore,
      };
    } catch (error) {
      logger.error('Error getting notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(
    notificationId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    try {
      const result = await Notification.updateOne(
        { _id: notificationId, userId },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        this.emit('notificationRead', { notificationId, userId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: mongoose.Types.ObjectId): Promise<number> {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        this.emit('allNotificationsRead', { userId, count: result.modifiedCount });
      }

      return result.modifiedCount;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(
    notificationId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    try {
      const result = await Notification.deleteOne({ _id: notificationId, userId });

      if (result.deletedCount > 0) {
        this.emit('notificationDeleted', { notificationId, userId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: mongoose.Types.ObjectId): Promise<number> {
    try {
      return await Notification.countDocuments({ userId, isRead: false });
    } catch (error) {
      logger.error('Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * Check privacy settings to determine if notification should be sent
   */
  private async checkPrivacySettings(
    userId: mongoose.Types.ObjectId,
    notificationType: INotification['type']
  ): Promise<boolean> {
    try {
      const privacySettings = await PrivacySettings.findOne({ userId });

      if (!privacySettings) {
        return true; // Default to allowing notifications if no settings found
      }

      switch (notificationType) {
        case 'follow':
          return privacySettings.notifyOnFollow;
        case 'comment':
          return privacySettings.notifyOnComment;
        case 'like':
          return privacySettings.notifyOnLike;
        case 'mention':
          return privacySettings.notifyOnMention;
        default:
          return true; // Allow other types by default
      }
    } catch (error) {
      logger.error('Error checking privacy settings:', error);
      return true; // Default to allowing on error
    }
  }

  /**
   * Generate notification content for social interactions
   */
  private generateSocialNotificationContent(
    type: 'like' | 'comment' | 'follow',
    actorName: string,
    targetName?: string,
    targetType?: string
  ): { title: string; message: string } {
    switch (type) {
      case 'like':
        return {
          title: 'New Like',
          message: targetName
            ? `${actorName} liked your ${targetType || 'post'} "${targetName}"`
            : `${actorName} liked your ${targetType || 'post'}`,
        };

      case 'comment':
        return {
          title: 'New Comment',
          message: targetName
            ? `${actorName} commented on your ${targetType || 'post'} "${targetName}"`
            : `${actorName} commented on your ${targetType || 'post'}`,
        };

      case 'follow':
        return {
          title: 'New Follower',
          message: `${actorName} started following you`,
        };

      default:
        return {
          title: 'New Notification',
          message: `${actorName} interacted with your content`,
        };
    }
  }

  /**
   * Setup periodic cleanup job for expired notifications
   */
  private setupCleanupJob(): void {
    // Run cleanup every 24 hours
    setInterval(
      async () => {
        try {
          const result = await Notification.deleteMany({
            expiresAt: { $lt: new Date() },
          });

          if (result.deletedCount > 0) {
            logger.info(`Cleaned up ${result.deletedCount} expired notifications`);
          }
        } catch (error) {
          logger.error('Error during notification cleanup:', error);
        }
      },
      24 * 60 * 60 * 1000
    ); // 24 hours
  }

  /**
   * Cleanup old notifications (older than specified days)
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const result = await Notification.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      logger.info(
        `Cleaned up ${result.deletedCount} old notifications (older than ${daysOld} days)`
      );
      return result.deletedCount;
    } catch (error) {
      logger.error('Error cleaning up old notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId: mongoose.Types.ObjectId): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    recentActivity: number; // Last 24 hours
  }> {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [total, unread, byType, byPriority, recentActivity] = await Promise.all([
        Notification.countDocuments({ userId }),
        Notification.countDocuments({ userId, isRead: false }),
        Notification.aggregate([
          { $match: { userId } },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ]),
        Notification.aggregate([
          { $match: { userId } },
          { $group: { _id: '$priority', count: { $sum: 1 } } },
        ]),
        Notification.countDocuments({ userId, createdAt: { $gte: yesterday } }),
      ]);

      // Convert aggregation results to objects
      const typeStats: Record<string, number> = {};
      byType.forEach((item: any) => {
        typeStats[item._id] = item.count;
      });

      const priorityStats: Record<string, number> = {};
      byPriority.forEach((item: any) => {
        priorityStats[item._id] = item.count;
      });

      return {
        total,
        unread,
        byType: typeStats,
        byPriority: priorityStats,
        recentActivity,
      };
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  }
}

export default NotificationService.getInstance();
