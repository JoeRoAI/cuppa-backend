import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'like' | 'comment' | 'follow' | 'checkin' | 'review' | 'event' | 'achievement' | 'mention';
  title: string;
  message: string;
  data?: {
    targetType?: 'user' | 'coffee' | 'shop' | 'review' | 'checkin' | 'comment';
    targetId?: mongoose.Types.ObjectId;
    targetName?: string;
    actorId?: mongoose.Types.ObjectId;
    actorName?: string;
    actorImage?: string;
    metadata?: Record<string, any>;
  };
  isRead: boolean;
  isDelivered: boolean;
  deliveredAt?: Date;
  readAt?: Date;
  expiresAt?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['like', 'comment', 'follow', 'checkin', 'review', 'event', 'achievement', 'mention'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    data: {
      targetType: {
        type: String,
        enum: ['user', 'coffee', 'shop', 'review', 'checkin', 'comment'],
      },
      targetId: {
        type: mongoose.Schema.Types.ObjectId,
      },
      targetName: {
        type: String,
        maxlength: 100,
      },
      actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      actorName: {
        type: String,
        maxlength: 100,
      },
      actorImage: {
        type: String,
      },
      metadata: {
        type: Schema.Types.Mixed,
      },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isDelivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }, // TTL index for automatic cleanup
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, priority: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: -1 }); // For cleanup operations

// Virtual for time since creation
NotificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now.getTime() - this.createdAt.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
});

// Instance methods
NotificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

NotificationSchema.methods.markAsDelivered = function() {
  this.isDelivered = true;
  this.deliveredAt = new Date();
  return this.save();
};

// Static methods
NotificationSchema.statics.getUnreadCount = function(userId: mongoose.Types.ObjectId) {
  return this.countDocuments({ userId, isRead: false });
};

NotificationSchema.statics.markAllAsRead = function(userId: mongoose.Types.ObjectId) {
  return this.updateMany(
    { userId, isRead: false },
    { 
      $set: { 
        isRead: true, 
        readAt: new Date() 
      } 
    }
  );
};

NotificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

// Pre-save middleware to set default expiration (30 days)
NotificationSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  }
  next();
});

export default mongoose.model<INotification>('Notification', NotificationSchema); 