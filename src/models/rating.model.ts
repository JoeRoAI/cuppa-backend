import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface for the Rating document
 */
export interface IRatingDocument extends Document {
  userId: mongoose.Types.ObjectId;
  coffeeId: mongoose.Types.ObjectId;
  shopId?: mongoose.Types.ObjectId;
  checkInId?: mongoose.Types.ObjectId;
  overall: number;
  aroma?: number;
  flavor?: number;
  aftertaste?: number;
  acidity?: number;
  body?: number;
  balance?: number;
  uniformity?: number;
  cleanCup?: number;
  sweetness?: number;
  comment?: string;
  images?: string[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Rating Schema for MongoDB
 */
const RatingSchema: Schema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    coffeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coffee',
      required: [true, 'Coffee ID is required'],
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
    },
    checkInId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CheckIn',
    },
    overall: {
      type: Number,
      required: [true, 'Overall rating is required'],
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
    },
    // Multi-dimensional rating fields - all on a 1-5 scale
    aroma: {
      type: Number,
      min: [1, 'Aroma rating must be between 1 and 5'],
      max: [5, 'Aroma rating must be between 1 and 5'],
    },
    flavor: {
      type: Number,
      min: [1, 'Flavor rating must be between 1 and 5'],
      max: [5, 'Flavor rating must be between 1 and 5'],
    },
    aftertaste: {
      type: Number,
      min: [1, 'Aftertaste rating must be between 1 and 5'],
      max: [5, 'Aftertaste rating must be between 1 and 5'],
    },
    acidity: {
      type: Number,
      min: [1, 'Acidity rating must be between 1 and 5'],
      max: [5, 'Acidity rating must be between 1 and 5'],
    },
    body: {
      type: Number,
      min: [1, 'Body rating must be between 1 and 5'],
      max: [5, 'Body rating must be between 1 and 5'],
    },
    balance: {
      type: Number,
      min: [1, 'Balance rating must be between 1 and 5'],
      max: [5, 'Balance rating must be between 1 and 5'],
    },
    uniformity: {
      type: Number,
      min: [1, 'Uniformity rating must be between 1 and 5'],
      max: [5, 'Uniformity rating must be between 1 and 5'],
    },
    cleanCup: {
      type: Number,
      min: [1, 'Clean cup rating must be between 1 and 5'],
      max: [5, 'Clean cup rating must be between 1 and 5'],
    },
    sweetness: {
      type: Number,
      min: [1, 'Sweetness rating must be between 1 and 5'],
      max: [5, 'Sweetness rating must be between 1 and 5'],
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
    images: {
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
  }
);

// Create an index for quick lookups
RatingSchema.index({ userId: 1, coffeeId: 1 });
RatingSchema.index({ coffeeId: 1, createdAt: -1 });
RatingSchema.index({ userId: 1, createdAt: -1 });

// Virtual for calculating the total score (SCA inspired but simplified)
RatingSchema.virtual('totalScore').get(function(this: IRatingDocument) {
  let total = this.overall * 2; // Overall rating is weighted more
  
  // Add all specified dimensions with proper type checking
  if (this.aroma !== undefined) total += this.aroma;
  if (this.flavor !== undefined) total += this.flavor;
  if (this.aftertaste !== undefined) total += this.aftertaste;
  if (this.acidity !== undefined) total += this.acidity;
  if (this.body !== undefined) total += this.body;
  if (this.balance !== undefined) total += this.balance;
  if (this.uniformity !== undefined) total += this.uniformity;
  if (this.cleanCup !== undefined) total += this.cleanCup;
  if (this.sweetness !== undefined) total += this.sweetness;
  
  // Count how many dimensions were provided
  const dimensionCount = [
    this.aroma, this.flavor, this.aftertaste, 
    this.acidity, this.body, this.balance,
    this.uniformity, this.cleanCup, this.sweetness
  ].filter((val): val is number => val !== undefined).length;
  
  // Calculate weighted average
  const weightedTotal = total / (dimensionCount + 2); // +2 for the overall rating (weighted x2)
  
  // Normalize to a 100 point scale (like SCA)
  return Math.round(weightedTotal * 20);
});

// Ensure virtuals are included in JSON output
RatingSchema.set('toJSON', { virtuals: true });
RatingSchema.set('toObject', { virtuals: true });

const Rating = mongoose.model<IRatingDocument>('Rating', RatingSchema);

export default Rating;
