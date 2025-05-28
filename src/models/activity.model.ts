/**
 * activity.model.ts
 * Defines the data model for user activities that will be used in activity feeds.
 * This model captures various types of user actions that can be displayed in feeds.
 */

import mongoose, { Schema, Document } from 'mongoose';

// Types of activities that can be tracked
export type ActivityType = 
  | 'follow' 
  | 'like' 
  | 'comment' 
  | 'review' 
  | 'checkin'
  | 'share'
  | 'recommendation'
  | 'badge_earned'
  | 'profile_update';

// Interface for Activity documents
export interface IActivity extends Document {
  userId: mongoose.Types.ObjectId;      // User who performed the activity
  activityType: ActivityType;           // Type of activity
  targetId?: mongoose.Types.ObjectId;   // Target object of the activity (post, user, coffee, etc.)
  targetType?: string;                  // Type of target (user, coffee, post, etc.)
  targetUserId?: mongoose.Types.ObjectId; // If activity involves another user
  content?: string;                     // Optional content (comment text, review content)
  metadata?: Record<string, any>;       // Additional activity-specific data
  visibility: 'public' | 'followers' | 'private'; // Activity visibility settings
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;                   // Soft delete flag
}

// Schema for Activity
const ActivitySchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    activityType: {
      type: String,
      required: true,
      enum: [
        'follow', 
        'like', 
        'comment', 
        'review', 
        'checkin',
        'share',
        'recommendation',
        'badge_earned',
        'profile_update'
      ],
      index: true
    },
    targetId: {
      type: Schema.Types.ObjectId,
      refPath: 'targetType',
      index: true
    },
    targetType: {
      type: String,
      enum: ['User', 'Coffee', 'Post', 'Comment', 'Review'],
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    content: {
      type: String,
      trim: true
    },
    metadata: {
      type: Schema.Types.Mixed
    },
    visibility: {
      type: String,
      enum: ['public', 'followers', 'private'],
      default: 'public',
      index: true
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Create compound indices for efficient querying
ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ targetUserId: 1, createdAt: -1 });
ActivitySchema.index({ activityType: 1, createdAt: -1 });

// Create and export the model
export const Activity = mongoose.model<IActivity>('Activity', ActivitySchema); 