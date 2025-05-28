import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import NotificationService from '../services/notification.service';
import Notification from '../models/notification.model';
import User from '../models/user.model';
import PrivacySettings from '../models/privacy-settings.model';

describe('NotificationService', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testActorId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await Notification.deleteMany({});
    await User.deleteMany({});
    await PrivacySettings.deleteMany({});

    // Create test users
    const testUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    });
    await testUser.save();
    testUserId = testUser._id as mongoose.Types.ObjectId;

    const testActor = new User({
      name: 'Test Actor',
      email: 'actor@example.com',
      password: 'password123',
    });
    await testActor.save();
    testActorId = testActor._id as mongoose.Types.ObjectId;
  });

  afterEach(async () => {
    await Notification.deleteMany({});
    await User.deleteMany({});
    await PrivacySettings.deleteMany({});
  });

  describe('createNotification', () => {
    it('should create a notification successfully', async () => {
      const notificationData = {
        userId: testUserId,
        type: 'like' as const,
        title: 'New Like',
        message: 'Someone liked your post',
        priority: 'medium' as const,
      };

      const notification = await NotificationService.createNotification(notificationData);

      expect(notification).toBeTruthy();
      expect(notification!.userId.toString()).toBe(testUserId.toString());
      expect(notification!.type).toBe('like');
      expect(notification!.title).toBe('New Like');
      expect(notification!.message).toBe('Someone liked your post');
      expect(notification!.priority).toBe('medium');
      expect(notification!.isRead).toBe(false);
      expect(notification!.isDelivered).toBe(false);
    });

    it('should not create notification for non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      const notificationData = {
        userId: fakeUserId,
        type: 'like' as const,
        title: 'New Like',
        message: 'Someone liked your post',
      };

      const notification = await NotificationService.createNotification(notificationData);
      expect(notification).toBeNull();
    });

    it('should respect privacy settings', async () => {
      // Create privacy settings that disable like notifications
      await PrivacySettings.create({
        userId: testUserId,
        notifyOnLike: false,
        notifyOnComment: true,
        notifyOnFollow: true,
        notifyOnMention: true,
      });

      const notificationData = {
        userId: testUserId,
        type: 'like' as const,
        title: 'New Like',
        message: 'Someone liked your post',
      };

      const notification = await NotificationService.createNotification(notificationData);
      expect(notification).toBeNull();
    });

    it('should create notification when privacy settings allow it', async () => {
      // Create privacy settings that allow like notifications
      await PrivacySettings.create({
        userId: testUserId,
        notifyOnLike: true,
        notifyOnComment: true,
        notifyOnFollow: true,
        notifyOnMention: true,
      });

      const notificationData = {
        userId: testUserId,
        type: 'like' as const,
        title: 'New Like',
        message: 'Someone liked your post',
      };

      const notification = await NotificationService.createNotification(notificationData);
      expect(notification).toBeTruthy();
    });
  });

  describe('createSocialNotification', () => {
    it('should create a social notification for likes', async () => {
      const params = {
        recipientId: testUserId,
        actorId: testActorId,
        type: 'like' as const,
        targetType: 'review' as const,
        targetId: new mongoose.Types.ObjectId(),
        targetName: 'Great Coffee Review',
      };

      const notification = await NotificationService.createSocialNotification(params);

      expect(notification).toBeTruthy();
      expect(notification!.type).toBe('like');
      expect(notification!.title).toBe('New Like');
      expect(notification!.message).toContain('Test Actor liked your review');
      expect(notification!.data?.actorName).toBe('Test Actor');
      expect(notification!.data?.targetName).toBe('Great Coffee Review');
    });

    it('should not create notification for self-interaction', async () => {
      const params = {
        recipientId: testUserId,
        actorId: testUserId, // Same user
        type: 'like' as const,
        targetType: 'review' as const,
        targetId: new mongoose.Types.ObjectId(),
        targetName: 'Great Coffee Review',
      };

      const notification = await NotificationService.createSocialNotification(params);
      expect(notification).toBeNull();
    });

    it('should create follow notification with high priority', async () => {
      const params = {
        recipientId: testUserId,
        actorId: testActorId,
        type: 'follow' as const,
      };

      const notification = await NotificationService.createSocialNotification(params);

      expect(notification).toBeTruthy();
      expect(notification!.type).toBe('follow');
      expect(notification!.priority).toBe('high');
      expect(notification!.title).toBe('New Follower');
      expect(notification!.message).toContain('Test Actor started following you');
    });
  });

  describe('getNotifications', () => {
    beforeEach(async () => {
      // Create test notifications
      await Notification.create([
        {
          userId: testUserId,
          type: 'like',
          title: 'Like 1',
          message: 'Message 1',
          priority: 'high',
          isRead: false,
        },
        {
          userId: testUserId,
          type: 'comment',
          title: 'Comment 1',
          message: 'Message 2',
          priority: 'medium',
          isRead: true,
        },
        {
          userId: testUserId,
          type: 'follow',
          title: 'Follow 1',
          message: 'Message 3',
          priority: 'low',
          isRead: false,
        },
      ]);
    });

    it('should get all notifications for user', async () => {
      const result = await NotificationService.getNotifications(testUserId);

      expect(result.notifications).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.unreadCount).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should filter notifications by type', async () => {
      const result = await NotificationService.getNotifications(
        testUserId,
        { type: 'like' }
      );

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].type).toBe('like');
    });

    it('should filter notifications by read status', async () => {
      const result = await NotificationService.getNotifications(
        testUserId,
        { isRead: false }
      );

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications.every(n => !n.isRead)).toBe(true);
    });

    it('should paginate notifications', async () => {
      const result = await NotificationService.getNotifications(
        testUserId,
        {},
        { page: 1, limit: 2 }
      );

      expect(result.notifications).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('should sort notifications by priority', async () => {
      const result = await NotificationService.getNotifications(
        testUserId,
        {},
        { sortBy: 'priority', sortOrder: 'desc' }
      );

      expect(result.notifications[0].priority).toBe('high');
      expect(result.notifications[2].priority).toBe('low');
    });
  });

  describe('markAsRead', () => {
    let notificationId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      const notification = await Notification.create({
        userId: testUserId,
        type: 'like',
        title: 'Test Notification',
        message: 'Test Message',
        isRead: false,
      });
      notificationId = notification._id as mongoose.Types.ObjectId;
    });

    it('should mark notification as read', async () => {
      const success = await NotificationService.markAsRead(notificationId, testUserId);

      expect(success).toBe(true);

      const notification = await Notification.findById(notificationId);
      expect(notification!.isRead).toBe(true);
      expect(notification!.readAt).toBeTruthy();
    });

    it('should not mark notification as read for wrong user', async () => {
      const wrongUserId = new mongoose.Types.ObjectId();
      const success = await NotificationService.markAsRead(notificationId, wrongUserId);

      expect(success).toBe(false);

      const notification = await Notification.findById(notificationId);
      expect(notification!.isRead).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          userId: testUserId,
          type: 'like',
          title: 'Notification 1',
          message: 'Message 1',
          isRead: false,
        },
        {
          userId: testUserId,
          type: 'comment',
          title: 'Notification 2',
          message: 'Message 2',
          isRead: false,
        },
        {
          userId: testUserId,
          type: 'follow',
          title: 'Notification 3',
          message: 'Message 3',
          isRead: true, // Already read
        },
      ]);
    });

    it('should mark all unread notifications as read', async () => {
      const count = await NotificationService.markAllAsRead(testUserId);

      expect(count).toBe(2);

      const unreadCount = await Notification.countDocuments({
        userId: testUserId,
        isRead: false,
      });
      expect(unreadCount).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          userId: testUserId,
          type: 'like',
          title: 'Notification 1',
          message: 'Message 1',
          isRead: false,
        },
        {
          userId: testUserId,
          type: 'comment',
          title: 'Notification 2',
          message: 'Message 2',
          isRead: false,
        },
        {
          userId: testUserId,
          type: 'follow',
          title: 'Notification 3',
          message: 'Message 3',
          isRead: true,
        },
      ]);
    });

    it('should return correct unread count', async () => {
      const count = await NotificationService.getUnreadCount(testUserId);
      expect(count).toBe(2);
    });
  });

  describe('deleteNotification', () => {
    let notificationId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      const notification = await Notification.create({
        userId: testUserId,
        type: 'like',
        title: 'Test Notification',
        message: 'Test Message',
      });
      notificationId = notification._id as mongoose.Types.ObjectId;
    });

    it('should delete notification successfully', async () => {
      const success = await NotificationService.deleteNotification(notificationId, testUserId);

      expect(success).toBe(true);

      const notification = await Notification.findById(notificationId);
      expect(notification).toBeNull();
    });

    it('should not delete notification for wrong user', async () => {
      const wrongUserId = new mongoose.Types.ObjectId();
      const success = await NotificationService.deleteNotification(notificationId, wrongUserId);

      expect(success).toBe(false);

      const notification = await Notification.findById(notificationId);
      expect(notification).toBeTruthy();
    });
  });

  describe('getNotificationStats', () => {
    beforeEach(async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      await Notification.create([
        {
          userId: testUserId,
          type: 'like',
          title: 'Like 1',
          message: 'Message 1',
          priority: 'high',
          isRead: false,
          createdAt: new Date(),
        },
        {
          userId: testUserId,
          type: 'like',
          title: 'Like 2',
          message: 'Message 2',
          priority: 'medium',
          isRead: true,
          createdAt: yesterday,
        },
        {
          userId: testUserId,
          type: 'comment',
          title: 'Comment 1',
          message: 'Message 3',
          priority: 'low',
          isRead: false,
          createdAt: new Date(),
        },
      ]);
    });

    it('should return correct notification statistics', async () => {
      const stats = await NotificationService.getNotificationStats(testUserId);

      expect(stats.total).toBe(3);
      expect(stats.unread).toBe(2);
      expect(stats.byType.like).toBe(2);
      expect(stats.byType.comment).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.recentActivity).toBe(2); // Last 24 hours
    });
  });

  describe('cleanupOldNotifications', () => {
    beforeEach(async () => {
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      await Notification.create([
        {
          userId: testUserId,
          type: 'like',
          title: 'Old Notification',
          message: 'Old Message',
          createdAt: oldDate,
        },
        {
          userId: testUserId,
          type: 'comment',
          title: 'Recent Notification',
          message: 'Recent Message',
          createdAt: recentDate,
        },
      ]);
    });

    it('should cleanup old notifications', async () => {
      const deletedCount = await NotificationService.cleanupOldNotifications(30);

      expect(deletedCount).toBe(1);

      const remainingCount = await Notification.countDocuments({ userId: testUserId });
      expect(remainingCount).toBe(1);
    });
  });
}); 