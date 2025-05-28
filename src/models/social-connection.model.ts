/**
 * social-connection.model.ts
 * Defines the data models for social connections between users, including following relationships,
 * social interactions, and connection strength.
 */

import mongoose, { Schema, Document } from 'mongoose';

// Interface for social connection data
export interface ISocialConnection extends Document {
  followerId: mongoose.Types.ObjectId; // User who follows
  followedId: mongoose.Types.ObjectId; // User being followed
  createdAt: Date;
  strength: number; // Connection strength based on interactions (range 0-1)
  status: 'active' | 'inactive' | 'blocked'; // Connection status
  lastInteractionDate?: Date;
  interactionCount: number;
  interactionTypes?: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    [key: string]: number;
  };
  notes?: string; // Optional notes about the connection
  updateStrength(): void; // Method to recalculate connection strength
}

// Schema definition
const SocialConnectionSchema = new Schema<ISocialConnection>(
  {
    followerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    followedId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
    },
    strength: {
      type: Number,
      default: 0.1,
      min: 0,
      max: 1,
    },
    lastInteractionDate: {
      type: Date,
      default: Date.now,
    },
    interactionCount: {
      type: Number,
      default: 0,
    },
    interactionTypes: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient lookups
SocialConnectionSchema.index({ followerId: 1, followedId: 1 }, { unique: true });
SocialConnectionSchema.index({ followedId: 1, status: 1 }); // For finding followers
SocialConnectionSchema.index({ followerId: 1, status: 1 }); // For finding following

// Method to calculate and update connection strength based on interactions
SocialConnectionSchema.methods.updateStrength = function (): void {
  if (!this.interactionTypes) return;

  // Weights for different interaction types
  const weights = {
    likes: 0.2,
    comments: 0.3,
    shares: 0.4,
    views: 0.1,
  };

  // Calculate weighted score based on interaction counts
  let weightedScore = 0;
  let totalInteractions = 0;

  Object.entries(this.interactionTypes).forEach(([type, count]) => {
    if (type in weights) {
      weightedScore += (count as number) * weights[type as keyof typeof weights];
      totalInteractions += count as number;
    }
  });

  // Base strength from follow relationship
  let strength = 0.1;

  // Add interaction-based strength (max 0.9 additional)
  if (totalInteractions > 0) {
    // Calculate diminishing returns for interaction count
    // More interactions = stronger connection, but with a ceiling
    const interactionFactor = Math.min(0.9, totalInteractions / 100);

    // Weighted by type of interaction
    const typeScore = totalInteractions > 0 ? weightedScore / totalInteractions : 0;

    // Combine base strength with interaction factors
    strength += interactionFactor * typeScore;
  }

  // Add recency factor - more recent interactions strengthen connection
  if (this.lastInteractionDate) {
    const daysSinceLastInteraction =
      (Date.now() - this.lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24);
    const recencyFactor = Math.max(0, 1 - daysSinceLastInteraction / 90); // Decay over 90 days
    strength *= recencyFactor;
  }

  // Ensure strength is between 0 and 1
  this.strength = Math.max(0, Math.min(1, strength));
};

// Pre-save hook to update strength before saving
SocialConnectionSchema.pre('save', function (next) {
  this.updateStrength();
  next();
});

// Create and export the model
export const SocialConnection = mongoose.model<ISocialConnection>(
  'SocialConnection',
  SocialConnectionSchema
);
