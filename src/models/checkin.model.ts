import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface for the CheckIn document
 */
export interface ICheckInDocument extends Document {
  userId: mongoose.Types.ObjectId;
  shopId: mongoose.Types.ObjectId;
  coffeeId?: mongoose.Types.ObjectId;
  purchasedItem?: string;
  notes?: string;
  images?: string[];
  location?: {
    type: string;
    coordinates: number[];
  };
  brewMethod?: string;
  tags?: string[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CheckIn Schema for MongoDB
 */
const CheckInSchema: Schema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Coffee Shop ID is required'],
    },
    coffeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coffee',
    },
    purchasedItem: {
      type: String,
      maxlength: [200, 'Purchased item name cannot exceed 200 characters'],
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    images: {
      type: [String],
      default: [],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    brewMethod: {
      type: String,
    },
    tags: {
      type: [String],
      default: [],
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for geospatial queries
CheckInSchema.index({ location: '2dsphere' });

// Index for finding all check-ins for a shop
CheckInSchema.index({ shopId: 1, createdAt: -1 });

// Index for finding all check-ins by a user
CheckInSchema.index({ userId: 1, createdAt: -1 });

// Compound index for user and shop (if we want to limit one check-in per shop per day)
// We're using a sparse index to allow multiple check-ins to the same shop
CheckInSchema.index({ userId: 1, shopId: 1, createdAt: -1 });

export default mongoose.model<ICheckInDocument>('CheckIn', CheckInSchema);
