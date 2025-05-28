/**
 * recommendation.model.ts
 * Mongoose schemas for recommendation-related data
 */

import mongoose, { Schema, Document } from 'mongoose';

/**
 * User Interaction Schema
 * Tracks all user interactions with coffee items (views, clicks, ratings, etc.)
 */
export interface IUserInteraction extends Document {
  userId: mongoose.Types.ObjectId;
  coffeeId: mongoose.Types.ObjectId;
  interactionType: string;
  value?: number;
  timestamp: Date;
  metadata?: {
    deviceType?: string;
    location?: string;
    timeOfDay?: string;
    dayOfWeek?: number;
    sessionId?: string;
    referrer?: string;
    [key: string]: any;
  };
}

const UserInteractionSchema: Schema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    coffeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coffee',
      required: true,
      index: true,
    },
    interactionType: {
      type: String,
      required: true,
      enum: ['view', 'click', 'search', 'favorite', 'purchase', 'rating', 'share', 'review'],
      index: true,
    },
    value: {
      type: Number,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      deviceType: String,
      location: String,
      timeOfDay: String,
      dayOfWeek: Number,
      sessionId: String,
      referrer: String,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound indexes for efficient querying
UserInteractionSchema.index({ userId: 1, coffeeId: 1, interactionType: 1 });
UserInteractionSchema.index({ userId: 1, timestamp: -1 });

/**
 * Recommendation Schema
 * Stores recommendations generated for users
 */
export interface IRecommendation extends Document {
  userId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  itemType: 'coffee' | 'roaster' | 'shop' | 'user';
  score: number;
  reason: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'viewed' | 'clicked' | 'dismissed';
}

const RecommendationSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      // This is a dynamic reference based on itemType
      refPath: 'itemType',
    },
    itemType: {
      type: String,
      required: true,
      enum: ['coffee', 'roaster', 'shop', 'user'],
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    reason: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'viewed', 'clicked', 'dismissed'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add compound indices for efficient querying
RecommendationSchema.index({ userId: 1, status: 1 });
RecommendationSchema.index({ userId: 1, itemType: 1 });

/**
 * Taste Similarity Schema
 * Stores similarity scores between users for collaborative filtering
 */
export interface ITasteSimilarity extends Document {
  userId1: mongoose.Types.ObjectId;
  userId2: mongoose.Types.ObjectId;
  similarityScore: number;
  lastCalculated: Date;
}

const TasteSimilaritySchema: Schema = new Schema(
  {
    userId1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userId2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    similarityScore: {
      type: Number,
      required: true,
      min: -1,
      max: 1,
    },
    lastCalculated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for efficient querying
TasteSimilaritySchema.index({ userId1: 1, userId2: 1 }, { unique: true });
TasteSimilaritySchema.index({ userId1: 1, similarityScore: -1 });

/**
 * Item Similarity Schema
 * Stores similarity scores between coffee items
 */
export interface IItemSimilarity extends Document {
  coffeeId1: mongoose.Types.ObjectId;
  coffeeId2: mongoose.Types.ObjectId;
  similarityScore: number;
  similarityFactors: string[];
  lastCalculated: Date;
}

const ItemSimilaritySchema: Schema = new Schema(
  {
    coffeeId1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coffee',
      required: true,
      index: true,
    },
    coffeeId2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coffee',
      required: true,
      index: true,
    },
    similarityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    similarityFactors: [
      {
        type: String,
      },
    ],
    lastCalculated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for efficient querying
ItemSimilaritySchema.index({ coffeeId1: 1, coffeeId2: 1 }, { unique: true });
ItemSimilaritySchema.index({ coffeeId1: 1, similarityScore: -1 });

// Create and export models
export const UserInteraction = mongoose.model<IUserInteraction>(
  'UserInteraction',
  UserInteractionSchema
);
export const Recommendation = mongoose.model<IRecommendation>(
  'Recommendation',
  RecommendationSchema
);
export const TasteSimilarity = mongoose.model<ITasteSimilarity>(
  'TasteSimilarity',
  TasteSimilaritySchema
);
export const ItemSimilarity = mongoose.model<IItemSimilarity>(
  'ItemSimilarity',
  ItemSimilaritySchema
);
