/**
 * comment.model.ts
 * Defines the data model for comments on various content types.
 */

import mongoose, { Schema, Document } from 'mongoose';

// Interface for Comment documents
export interface IComment extends Document {
  userId: mongoose.Types.ObjectId; // User who created the comment
  content: string; // Comment text
  targetId: mongoose.Types.ObjectId; // ID of the commented content
  targetType: string; // Type of content (Coffee, Review)
  parentId?: mongoose.Types.ObjectId; // For threaded comments, reference to parent comment
  likeCount: number; // Cached count of likes for this comment
  isEdited: boolean; // Flag for edited comments
  isDeleted: boolean; // Soft delete flag
  status: 'approved' | 'pending' | 'spam' | 'rejected'; // Moderation status
  createdAt: Date;
  updatedAt: Date;
}

// Schema for comments
const CommentSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: [1, 'Comment cannot be empty'],
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      refPath: 'targetType',
      required: true,
    },
    targetType: {
      type: String,
      required: true,
      enum: ['Coffee', 'Review'],
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
    },
    likeCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['approved', 'pending', 'spam', 'rejected'],
      default: 'approved',
    },
  },
  {
    timestamps: true,
  }
);

// Create compound indices for efficient querying
CommentSchema.index({ targetId: 1, targetType: 1, isDeleted: 1, status: 1 });
CommentSchema.index({ parentId: 1, isDeleted: 1, status: 1 });

// Create and export the model
export const Comment = mongoose.model<IComment>('Comment', CommentSchema);
