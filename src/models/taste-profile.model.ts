import mongoose, { Schema, Document } from 'mongoose';

/**
 * Coffee attributes that can be rated and analyzed for taste profiles
 */
export enum CoffeeAttribute {
  ACIDITY = 'acidity',
  BODY = 'body',
  SWEETNESS = 'sweetness',
  AROMA = 'aroma',
  FLAVOR = 'flavor',
  AFTERTASTE = 'aftertaste',
  BALANCE = 'balance',
  UNIFORMITY = 'uniformity',
  CLEAN_CUP = 'cleanCup'
}

/**
 * Interface for preferred attribute with confidence scoring
 */
export interface IPreferredAttribute {
  attribute: CoffeeAttribute;
  preferenceScore: number; // 0-100: How much the user likes this attribute
  confidence: number;      // 0-100: Confidence in this preference based on data
  averageRating: number;   // Average rating for this attribute
  ratingCount: number;     // Number of ratings for this attribute
}

/**
 * Interface for preferred flavor profile
 */
export interface IPreferredFlavorProfile {
  flavorNote: string;
  frequency: number;       // How often this appears in user's highly-rated coffees
  preferenceScore: number; // 0-100: How much the user likes this flavor
  averageRating: number;   // Average overall rating when this flavor is present
}

/**
 * Interface for preferred coffee characteristics
 */
export interface IPreferredCharacteristics {
  roastLevels: {
    level: string;
    frequency: number;
    averageRating: number;
  }[];
  origins: {
    country: string;
    region?: string;
    frequency: number;
    averageRating: number;
  }[];
  processingMethods: {
    method: string;
    frequency: number;
    averageRating: number;
  }[];
}

/**
 * Interface for rating patterns and statistics
 */
export interface IRatingPatterns {
  overallRatingDistribution: {
    rating: number;
    count: number;
    percentage: number;
  }[];
  averageOverallRating: number;
  ratingVariance: number;
  mostActiveTimeOfDay?: number; // Hour of day (0-23)
  mostActiveDay?: number;       // Day of week (1-7)
  ratingTrends: {
    period: string; // 'week', 'month', 'quarter'
    averageRating: number;
    ratingCount: number;
  }[];
}

/**
 * Interface for the TasteProfile document
 */
export interface ITasteProfileDocument extends Document {
  userId: mongoose.Types.ObjectId;
  
  // Core taste preferences
  preferredAttributes: IPreferredAttribute[];
  preferredFlavorProfiles: IPreferredFlavorProfile[];
  preferredCharacteristics: IPreferredCharacteristics;
  
  // Rating patterns and behavior
  ratingPatterns: IRatingPatterns;
  
  // Profile metadata
  totalRatings: number;
  lastRatingDate?: Date;
  profileConfidence: number; // 0-100: Overall confidence in the profile
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastCalculated: Date;
}

/**
 * TasteProfile Schema for MongoDB
 */
const TasteProfileSchema: Schema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
    },
    
    preferredAttributes: [
      {
        attribute: {
          type: String,
          enum: Object.values(CoffeeAttribute),
          required: true,
        },
        preferenceScore: {
          type: Number,
          min: 0,
          max: 100,
          required: true,
        },
        confidence: {
          type: Number,
          min: 0,
          max: 100,
          required: true,
        },
        averageRating: {
          type: Number,
          min: 1,
          max: 5,
          required: true,
        },
        ratingCount: {
          type: Number,
          min: 0,
          required: true,
        },
      },
    ],
    
    preferredFlavorProfiles: [
      {
        flavorNote: {
          type: String,
          required: true,
        },
        frequency: {
          type: Number,
          min: 0,
          required: true,
        },
        preferenceScore: {
          type: Number,
          min: 0,
          max: 100,
          required: true,
        },
        averageRating: {
          type: Number,
          min: 1,
          max: 5,
          required: true,
        },
      },
    ],
    
    preferredCharacteristics: {
      roastLevels: [
        {
          level: {
            type: String,
            required: true,
          },
          frequency: {
            type: Number,
            min: 0,
            required: true,
          },
          averageRating: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
          },
        },
      ],
      origins: [
        {
          country: {
            type: String,
            required: true,
          },
          region: String,
          frequency: {
            type: Number,
            min: 0,
            required: true,
          },
          averageRating: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
          },
        },
      ],
      processingMethods: [
        {
          method: {
            type: String,
            required: true,
          },
          frequency: {
            type: Number,
            min: 0,
            required: true,
          },
          averageRating: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
          },
        },
      ],
    },
    
    ratingPatterns: {
      overallRatingDistribution: [
        {
          rating: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
          },
          count: {
            type: Number,
            min: 0,
            required: true,
          },
          percentage: {
            type: Number,
            min: 0,
            max: 100,
            required: true,
          },
        },
      ],
      averageOverallRating: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
      },
      ratingVariance: {
        type: Number,
        min: 0,
        required: true,
      },
      mostActiveTimeOfDay: {
        type: Number,
        min: 0,
        max: 23,
      },
      mostActiveDay: {
        type: Number,
        min: 1,
        max: 7,
      },
      ratingTrends: [
        {
          period: {
            type: String,
            enum: ['week', 'month', 'quarter'],
            required: true,
          },
          averageRating: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
          },
          ratingCount: {
            type: Number,
            min: 0,
            required: true,
          },
        },
      ],
    },
    
    totalRatings: {
      type: Number,
      min: 0,
      required: true,
      default: 0,
    },
    
    lastRatingDate: {
      type: Date,
    },
    
    profileConfidence: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
      default: 0,
    },
    
    lastCalculated: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient querying
TasteProfileSchema.index({ lastCalculated: 1 });
TasteProfileSchema.index({ profileConfidence: -1 });

// Export the model
const TasteProfile = mongoose.model<ITasteProfileDocument>('TasteProfile', TasteProfileSchema);

export default TasteProfile; 