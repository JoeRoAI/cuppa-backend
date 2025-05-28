import mongoose, { Document, Schema } from 'mongoose';

// Bookmark Interface
export interface IBookmark extends Document {
  user: mongoose.Types.ObjectId;
  guide: mongoose.Types.ObjectId;
  bookmarkedAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Bookmark Schema
const BookmarkSchema: Schema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  guide: {
    type: Schema.Types.ObjectId,
    ref: 'Guide',
    required: true
  },
  bookmarkedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index to ensure a user can only bookmark a guide once
BookmarkSchema.index({ user: 1, guide: 1 }, { unique: true });

// Index for efficient queries
BookmarkSchema.index({ user: 1, bookmarkedAt: -1 });
BookmarkSchema.index({ guide: 1 });

export const Bookmark = mongoose.model<IBookmark>('Bookmark', BookmarkSchema); 