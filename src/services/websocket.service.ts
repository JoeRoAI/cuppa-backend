import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import config from '../config/config';
import NotificationService from './notification.service';
import logger from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: mongoose.Types.ObjectId;
  user?: {
    id: mongoose.Types.ObjectId;
    email: string;
    role: string;
  };
}

interface SocketUser {
  userId: mongoose.Types.ObjectId;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
}

class WebSocketService extends EventEmitter {
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, SocketUser> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private static instance: WebSocketService;

  constructor() {
    super();
    this.setupNotificationListeners();
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          'http://localhost:3004',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();

    logger.info('WebSocket service initialized');
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware(): void {
    if (!this.io) return;

    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, config.JWT_SECRET) as any;
        
        if (!decoded.id) {
          return next(new Error('Invalid token payload'));
        }

        socket.userId = new mongoose.Types.ObjectId(decoded.id);
        socket.user = {
          id: new mongoose.Types.ObjectId(decoded.id),
          email: decoded.email,
          role: decoded.role,
        };

        next();
      } catch (error) {
        logger.warn('WebSocket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    if (!socket.userId) {
      socket.disconnect();
      return;
    }

    const userId = socket.userId.toString();
    const socketId = socket.id;

    // Track connected user
    this.connectedUsers.set(socketId, {
      userId: socket.userId,
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });

    // Track user's sockets
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);

    // Join user-specific room
    socket.join(`user:${userId}`);

    logger.debug(`User ${userId} connected via WebSocket (${socketId})`);

    // Send initial data
    this.sendInitialData(socket);

    // Setup event handlers
    this.setupSocketEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Emit connection event
    this.emit('userConnected', { userId: socket.userId, socketId });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: AuthenticatedSocket): void {
    if (!socket.userId) return;

    const userId = socket.userId.toString();
    const socketId = socket.id;

    // Remove from tracking
    this.connectedUsers.delete(socketId);
    
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    logger.debug(`User ${userId} disconnected from WebSocket (${socketId})`);

    // Emit disconnection event
    this.emit('userDisconnected', { userId: socket.userId, socketId });
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketEventHandlers(socket: AuthenticatedSocket): void {
    // Handle notification read
    socket.on('notification:read', async (data: { notificationId: string }) => {
      if (!socket.userId) return;

      try {
        const success = await NotificationService.markAsRead(
          new mongoose.Types.ObjectId(data.notificationId),
          socket.userId
        );

        if (success) {
          socket.emit('notification:read:success', { notificationId: data.notificationId });
          
          // Broadcast to all user's sockets
          this.broadcastToUser(socket.userId.toString(), 'notification:updated', {
            notificationId: data.notificationId,
            isRead: true,
          });
        }
      } catch (error) {
        logger.error('Error marking notification as read:', error);
        socket.emit('notification:read:error', { error: 'Failed to mark notification as read' });
      }
    });

    // Handle mark all notifications as read
    socket.on('notification:readAll', async () => {
      if (!socket.userId) return;

      try {
        const count = await NotificationService.markAllAsRead(socket.userId);
        
        socket.emit('notification:readAll:success', { count });
        
        // Broadcast to all user's sockets
        this.broadcastToUser(socket.userId.toString(), 'notification:allRead', { count });
      } catch (error) {
        logger.error('Error marking all notifications as read:', error);
        socket.emit('notification:readAll:error', { error: 'Failed to mark all notifications as read' });
      }
    });

    // Handle activity feed refresh
    socket.on('activityFeed:refresh', () => {
      if (!socket.userId) return;
      
      // Emit refresh event to trigger feed reload
      socket.emit('activityFeed:refreshRequested');
    });

    // Handle typing indicators for comments
    socket.on('comment:typing', (data: { targetId: string; targetType: string }) => {
      if (!socket.userId) return;

      // Broadcast typing indicator to other users viewing the same content
      socket.broadcast.emit('comment:userTyping', {
        userId: socket.userId,
        targetId: data.targetId,
        targetType: data.targetType,
      });
    });

    socket.on('comment:stopTyping', (data: { targetId: string; targetType: string }) => {
      if (!socket.userId) return;

      socket.broadcast.emit('comment:userStoppedTyping', {
        userId: socket.userId,
        targetId: data.targetId,
        targetType: data.targetType,
      });
    });

    // Handle presence updates
    socket.on('presence:update', () => {
      if (!socket.userId) return;

      const user = this.connectedUsers.get(socket.id);
      if (user) {
        user.lastActivity = new Date();
      }
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  }

  /**
   * Send initial data to newly connected socket
   */
  private async sendInitialData(socket: AuthenticatedSocket): Promise<void> {
    if (!socket.userId) return;

    try {
      // Send unread notification count
      const unreadCount = await NotificationService.getUnreadCount(socket.userId);
      socket.emit('notification:unreadCount', { count: unreadCount });

      // Send connection confirmation
      socket.emit('connection:confirmed', {
        userId: socket.userId,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error sending initial data:', error);
    }
  }

  /**
   * Setup notification service listeners
   */
  private setupNotificationListeners(): void {
    NotificationService.on('notificationCreated', (data) => {
      this.handleNewNotification(data);
    });

    NotificationService.on('notificationRead', (data) => {
      this.handleNotificationRead(data);
    });

    NotificationService.on('allNotificationsRead', (data) => {
      this.handleAllNotificationsRead(data);
    });
  }

  /**
   * Handle new notification
   */
  private handleNewNotification(data: { notification: any; userId: mongoose.Types.ObjectId }): void {
    const userId = data.userId.toString();
    
    // Send to all user's connected sockets
    this.broadcastToUser(userId, 'notification:new', {
      notification: data.notification,
    });

    // Update unread count
    this.updateUnreadCount(userId);
  }

  /**
   * Handle notification read
   */
  private handleNotificationRead(data: { notificationId: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId }): void {
    const userId = data.userId.toString();
    
    this.broadcastToUser(userId, 'notification:read', {
      notificationId: data.notificationId.toString(),
    });

    this.updateUnreadCount(userId);
  }

  /**
   * Handle all notifications read
   */
  private handleAllNotificationsRead(data: { userId: mongoose.Types.ObjectId; count: number }): void {
    const userId = data.userId.toString();
    
    this.broadcastToUser(userId, 'notification:allRead', {
      count: data.count,
    });

    // Send updated unread count (should be 0)
    this.broadcastToUser(userId, 'notification:unreadCount', { count: 0 });
  }

  /**
   * Update unread count for user
   */
  private async updateUnreadCount(userId: string): Promise<void> {
    try {
      const count = await NotificationService.getUnreadCount(new mongoose.Types.ObjectId(userId));
      this.broadcastToUser(userId, 'notification:unreadCount', { count });
    } catch (error) {
      logger.error('Error updating unread count:', error);
    }
  }

  /**
   * Broadcast message to all sockets of a specific user
   */
  public broadcastToUser(userId: string, event: string, data: any): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Broadcast message to all connected sockets
   */
  public broadcast(event: string, data: any): void {
    if (!this.io) return;

    this.io.emit(event, data);
  }

  /**
   * Send message to specific socket
   */
  public sendToSocket(socketId: string, event: string, data: any): void {
    if (!this.io) return;

    this.io.to(socketId).emit(event, data);
  }

  /**
   * Check if user is online
   */
  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  /**
   * Get online users count
   */
  public getOnlineUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Get connected sockets count
   */
  public getConnectedSocketsCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get user's connected sockets
   */
  public getUserSockets(userId: string): string[] {
    const socketSet = this.userSockets.get(userId);
    return socketSet ? Array.from(socketSet) : [];
  }

  /**
   * Disconnect user from all sockets
   */
  public disconnectUser(userId: string): void {
    if (!this.io) return;

    const socketIds = this.getUserSockets(userId);
    socketIds.forEach(socketId => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });
  }

  /**
   * Get service statistics
   */
  public getStats(): {
    onlineUsers: number;
    connectedSockets: number;
    totalConnections: number;
    averageConnectionTime: number;
  } {
    const now = new Date();
    let totalConnectionTime = 0;
    let connectionCount = 0;

    this.connectedUsers.forEach(user => {
      totalConnectionTime += now.getTime() - user.connectedAt.getTime();
      connectionCount++;
    });

    const averageConnectionTime = connectionCount > 0 ? totalConnectionTime / connectionCount : 0;

    return {
      onlineUsers: this.userSockets.size,
      connectedSockets: this.connectedUsers.size,
      totalConnections: connectionCount,
      averageConnectionTime: Math.round(averageConnectionTime / 1000), // in seconds
    };
  }

  /**
   * Cleanup inactive connections
   */
  public cleanupInactiveConnections(inactiveThresholdMs: number = 30 * 60 * 1000): void {
    if (!this.io) return;

    const now = new Date();
    const inactiveConnections: string[] = [];

    this.connectedUsers.forEach((user, socketId) => {
      if (now.getTime() - user.lastActivity.getTime() > inactiveThresholdMs) {
        inactiveConnections.push(socketId);
      }
    });

    inactiveConnections.forEach(socketId => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });

    if (inactiveConnections.length > 0) {
      logger.info(`Cleaned up ${inactiveConnections.length} inactive WebSocket connections`);
    }
  }
}

export default WebSocketService.getInstance(); 