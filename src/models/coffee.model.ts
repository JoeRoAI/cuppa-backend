import mongoose, { Schema, Document } from 'mongoose';

// Interfaces for embedded subdocuments
export interface IOrigin {
  country: string;
  region?: string;
  farm?: string;
  elevation?: number;
  producer?: string;
}

export interface IFlavorProfile {
  flavorNotes: string[];
  aroma?: string[];
  acidity?: number;
  body?: number;
  sweetness?: number;
  aftertaste?: number;
  bitterness?: number;
  balance?: number;
}

export interface IProcessingDetails {
  method: string;
  details?: string;
  harvestDate?: Date;
  roastDate?: Date;
}

export interface IPrice {
  amount: number;
  currency: string;
  size: string;
  unit: string;
  discounted?: boolean;
  originalAmount?: number;
}

export interface IRating {
  userId: mongoose.Types.ObjectId;
  overall: number;
  aroma?: number;
  flavor?: number;
  aftertaste?: number;
  acidity?: number;
  body?: number;
  balance?: number;
  comment?: string;
  images?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICuppingScore {
  overallScore: number;
  dryAroma?: number;
  wetAroma?: number;
  flavor?: number;
  aftertaste?: number;
  acidity?: number;
  body?: number;
  balance?: number;
  uniformity?: number;
  cleanCup?: number;
  sweetness?: number;
  defects?: number;
  cupper?: string;
  cuppingDate?: Date;
  notes?: string;
}

export interface ISupplier {
  name: string;
  location?: string;
  contactInfo?: string;
  website?: string;
  specialization?: string[];
}

export interface ICoffee extends Document {
  name: string;
  description: string;
  origin: IOrigin;
  roastLevel: string;
  processingDetails: IProcessingDetails;
  flavorProfile: IFlavorProfile;
  barcodes: string[];
  sku: string;
  productId?: string;
  images: string[];
  prices: IPrice[];
  categories: string[];
  tags: string[];
  certifications: string[];
  isActive: boolean;
  isAvailable: boolean;
  inStock: number;
  supplierId?: mongoose.Types.ObjectId;
  cuppingScore?: ICuppingScore;
  ratings?: IRating[];
  avgRating: number;
  ratingCount: number;
  relatedCoffees?: mongoose.Types.ObjectId[];

  // Shopify integration fields
  shopifyProductId?: string;
  shopifyVariantId?: string;
  shopifyHandle?: string;
  available?: boolean;
  imageUrl?: string;
  price?: number;
  currency?: string;
  lastSynced?: Date;

  createdAt: Date;
  updatedAt: Date;

  // Methods
  calculateAverageRating(): Promise<ICoffee>;
}

// Schema for coffee products
const CoffeeSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a coffee name'],
      trim: true,
      maxlength: [100, 'Name cannot be more than 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
      maxlength: [2000, 'Description cannot be more than 2000 characters'],
    },
    origin: {
      country: {
        type: String,
        required: [true, 'Please specify the country of origin'],
      },
      region: String,
      farm: String,
      elevation: Number,
      producer: String,
    },
    roastLevel: {
      type: String,
      required: [true, 'Please specify the roast level'],
      enum: ['light', 'medium-light', 'medium', 'medium-dark', 'dark', 'extra-dark'],
    },
    processingDetails: {
      method: {
        type: String,
        required: [true, 'Please specify the processing method'],
        enum: ['washed', 'natural', 'honey', 'wet-hulled', 'anaerobic', 'other'],
      },
      details: String,
      harvestDate: Date,
      roastDate: Date,
    },
    flavorProfile: {
      flavorNotes: {
        type: [String],
        default: [],
      },
      aroma: [String],
      acidity: {
        type: Number,
        min: 0,
        max: 10,
      },
      body: {
        type: Number,
        min: 0,
        max: 10,
      },
      sweetness: {
        type: Number,
        min: 0,
        max: 10,
      },
      aftertaste: {
        type: Number,
        min: 0,
        max: 10,
      },
      bitterness: {
        type: Number,
        min: 0,
        max: 10,
      },
      balance: {
        type: Number,
        min: 0,
        max: 10,
      },
    },
    barcodes: {
      type: [String],
      default: [],
    },
    sku: {
      type: String,
      required: [true, 'Please add a SKU'],
      // Comment out unique constraint for development
      // unique: true,
      trim: true,
    },
    productId: {
      type: String,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    prices: {
      type: [
        {
          amount: {
            type: Number,
            required: [true, 'Please add a price amount'],
          },
          currency: {
            type: String,
            default: 'USD',
          },
          size: {
            type: String,
            required: [true, 'Please specify the size'],
          },
          unit: {
            type: String,
            default: 'oz',
            enum: ['oz', 'g', 'lb', 'kg'],
          },
          discounted: {
            type: Boolean,
            default: false,
          },
          originalAmount: Number,
        },
      ],
      required: [true, 'Please add at least one price'],
    },
    categories: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    certifications: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    inStock: {
      type: Number,
      default: 0,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    supplier: {
      name: {
        type: String,
      },
      location: String,
      contactInfo: String,
      website: String,
      specialization: [String],
    },
    cuppingScore: {
      overallScore: {
        type: Number,
        min: 0,
        max: 100,
      },
      dryAroma: {
        type: Number,
        min: 0,
        max: 10,
      },
      wetAroma: {
        type: Number,
        min: 0,
        max: 10,
      },
      flavor: {
        type: Number,
        min: 0,
        max: 10,
      },
      aftertaste: {
        type: Number,
        min: 0,
        max: 10,
      },
      acidity: {
        type: Number,
        min: 0,
        max: 10,
      },
      body: {
        type: Number,
        min: 0,
        max: 10,
      },
      balance: {
        type: Number,
        min: 0,
        max: 10,
      },
      uniformity: {
        type: Number,
        min: 0,
        max: 10,
      },
      cleanCup: {
        type: Number,
        min: 0,
        max: 10,
      },
      sweetness: {
        type: Number,
        min: 0,
        max: 10,
      },
      defects: {
        type: Number,
        min: 0,
        max: 10,
      },
      cupper: String,
      cuppingDate: Date,
      notes: String,
    },
    ratings: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        overall: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        aroma: {
          type: Number,
          min: 1,
          max: 5,
        },
        flavor: {
          type: Number,
          min: 1,
          max: 5,
        },
        aftertaste: {
          type: Number,
          min: 1,
          max: 5,
        },
        acidity: {
          type: Number,
          min: 1,
          max: 5,
        },
        body: {
          type: Number,
          min: 1,
          max: 5,
        },
        balance: {
          type: Number,
          min: 1,
          max: 5,
        },
        comment: String,
        images: [String],
        createdAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    avgRating: {
      type: Number,
      default: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    relatedCoffees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coffee',
      },
    ],

    // Shopify integration fields
    shopifyProductId: {
      type: String,
      index: true,
    },
    shopifyVariantId: {
      type: String,
    },
    shopifyHandle: {
      type: String,
    },
    available: {
      type: Boolean,
      default: true,
    },
    imageUrl: {
      type: String,
    },
    price: {
      type: Number,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    lastSynced: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
CoffeeSchema.index({
  name: 'text',
  description: 'text',
  'origin.country': 'text',
  'origin.region': 'text',
});
CoffeeSchema.index({ 'origin.country': 1 });
CoffeeSchema.index({ roastLevel: 1 });
CoffeeSchema.index({ barcodes: 1 });
CoffeeSchema.index({ sku: 1 });
CoffeeSchema.index({ isActive: 1, isAvailable: 1 });
CoffeeSchema.index({ categories: 1 });
CoffeeSchema.index({ tags: 1 });
CoffeeSchema.index({ avgRating: -1 });
CoffeeSchema.index({ supplierId: 1 });

// Virtual for detailed ratings from Rating model
CoffeeSchema.virtual('detailedRatings', {
  ref: 'Rating',
  localField: '_id',
  foreignField: 'coffeeId',
  justOne: false,
});

// Virtual for collections that include this coffee
CoffeeSchema.virtual('collections', {
  ref: 'Collection',
  localField: '_id',
  foreignField: 'coffees',
  justOne: false,
});

// Virtual for detailed supplier info
CoffeeSchema.virtual('supplierDetails', {
  ref: 'Supplier',
  localField: 'supplierId',
  foreignField: '_id',
  justOne: true,
});

// Pre-save middleware for maintaining supplier compatibility
CoffeeSchema.pre('save', async function (next) {
  // If supplierId is set but supplier embedded doc doesn't match, update the embedded doc
  if (this.supplierId && this.supplierId.toString()) {
    try {
      const supplierModel = mongoose.model('Supplier');
      const supplierDoc = await supplierModel.findById(this.supplierId);

      if (supplierDoc) {
        this.supplier = {
          name: supplierDoc.name,
          location: supplierDoc.location?.country,
          contactInfo: supplierDoc.contactInfo?.email,
          website: supplierDoc.contactInfo?.website,
          specialization: supplierDoc.specializations,
        };
      }
    } catch (error) {
      // Continue even if supplier lookup fails
      console.error('Error updating supplier embedded doc:', error);
    }
  }
  next();
});

// Method to automatically update average rating when new ratings are added
CoffeeSchema.methods.calculateAverageRating = function (this: ICoffee) {
  if (this.ratings && Array.isArray(this.ratings) && this.ratings.length > 0) {
    const sum = this.ratings.reduce((acc, rating) => acc + rating.overall, 0);
    this.avgRating = sum / this.ratings.length;
    this.ratingCount = this.ratings.length;
  } else {
    this.avgRating = 0;
    this.ratingCount = 0;
  }
  return this.save();
};

// Auto-calculate average rating when saved
CoffeeSchema.pre('save', function (this: ICoffee, next) {
  if (this.isModified('ratings')) {
    if (this.ratings && Array.isArray(this.ratings) && this.ratings.length > 0) {
      const sum = this.ratings.reduce((acc, rating) => acc + rating.overall, 0);
      this.avgRating = sum / this.ratings.length;
      this.ratingCount = this.ratings.length;
    } else {
      this.avgRating = 0;
      this.ratingCount = 0;
    }
  }
  next();
});

export default mongoose.model<ICoffee>('Coffee', CoffeeSchema);
