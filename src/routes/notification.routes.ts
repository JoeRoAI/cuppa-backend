import express from 'express';
import { protect } from '../middleware/auth.middleware';
import NotificationController from '../controllers/notification.controller';

const router = express.Router();

// All notification routes require authentication
router.use(protect);

/**
 * Get notifications for the authenticated user
 * GET /api/notifications
 */
router.get('/', NotificationController.getNotifications);

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
router.get('/unread-count', NotificationController.getUnreadCount);

/**
 * Get notification statistics
 * GET /api/notifications/stats
 */
router.get('/stats', NotificationController.getStats);

/**
 * Mark notification as read
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', NotificationController.markAsRead);

/**
 * Mark all notifications as read
 * PATCH /api/notifications/read-all
 */
router.patch('/read-all', NotificationController.markAllAsRead);

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
router.delete('/:id', NotificationController.deleteNotification);

/**
 * Create test notification (development only)
 * POST /api/notifications/test
 */
router.post('/test', NotificationController.createTestNotification);

export default router;
