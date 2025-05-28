/**
 * like.model.ts
 * Defines the data model for likes on various content types.
 */

import mongoose, { Schema, Document } from 'mongoose';

// Interface for Like documents
export interface ILike extends Document {
  userId: mongoose.Types.ObjectId;      // User who created the like
  targetId: mongoose.Types.ObjectId;    // ID of the liked content
  targetType: string;                   // Type of content (Coffee, Review, Comment)
  createdAt: Date;
  isActive: boolean;                    // Flag to track "unliked" items
}

// Schema for likes
const LikeSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      refPath: 'targetType',
      required: true,
    },
    targetType: {
      type: String,
      required: true,
      enum: ['Coffee', 'Review', 'Comment'],
    },
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// Create compound index for preventing duplicate likes
LikeSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });

// Create compound index for efficient querying
LikeSchema.index({ targetId: 1, targetType: 1, isActive: 1 });

// Create and export the model
export const Like = mongoose.model<ILike>('Like', LikeSchema); 