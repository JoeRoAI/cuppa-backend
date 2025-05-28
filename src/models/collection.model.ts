import mongoose, { Schema, Document } from 'mongoose';

export interface ICollection extends Document {
  name: string;
  description?: string;
  userId: mongoose.Types.ObjectId;
  coffees: mongoose.Types.ObjectId[];
  isPublic: boolean;
  coverImage?: string;
  tags?: string[];
  upvotes: number;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a collection name'],
      trim: true,
      maxlength: [100, 'Name cannot be more than 100 characters'],
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot be more than 500 characters'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    coffees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coffee',
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
    },
    coverImage: {
      type: String,
    },
    tags: {
      type: [String],
      default: [],
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for finding all collections by a user
CollectionSchema.index({ userId: 1, createdAt: -1 });

// Index for finding public collections
CollectionSchema.index({ isPublic: 1, upvotes: -1, createdAt: -1 });

// Text index for search
CollectionSchema.index({ name: 'text', description: 'text', tags: 'text' });

export default mongoose.model<ICollection>('Collection', CollectionSchema);
