import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplierDocument extends Document {
  name: string;
  description?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: {
      type: string;
      coordinates: number[];
    };
  };
  contactInfo?: {
    email?: string;
    phone?: string;
    website?: string;
    social?: {
      instagram?: string;
      twitter?: string;
      facebook?: string;
    };
  };
  specializations?: string[];
  certifications?: string[];
  images?: {
    logo?: string;
    banner?: string;
    gallery?: string[];
  };
  establishedYear?: number;
  isVerified: boolean;
  avgRating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a supplier name'],
      trim: true,
      maxlength: [100, 'Name cannot be more than 100 characters'],
      unique: true,
    },
    description: {
      type: String,
      maxlength: [2000, 'Description cannot be more than 2000 characters'],
    },
    location: {
      address: String,
      city: String,
      state: String,
      country: String,
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        coordinates: {
          type: [Number],
          index: '2dsphere',
        },
      },
    },
    contactInfo: {
      email: {
        type: String,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please add a valid email'],
      },
      phone: String,
      website: String,
      social: {
        instagram: String,
        twitter: String,
        facebook: String,
      },
    },
    specializations: {
      type: [String],
      default: [],
    },
    certifications: {
      type: [String],
      default: [],
    },
    images: {
      logo: String,
      banner: String,
      gallery: {
        type: [String],
        default: [],
      },
    },
    establishedYear: {
      type: Number,
      min: 1500,
      max: new Date().getFullYear(),
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    avgRating: {
      type: Number,
      default: 0,
    },
    ratingCount: {
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

// Text index for search
SupplierSchema.index({
  name: 'text',
  description: 'text',
  specializations: 'text',
  'location.country': 'text',
  'location.city': 'text',
});

// Location based search index
SupplierSchema.index({ 'location.coordinates': '2dsphere' });

// Sorting indexes
SupplierSchema.index({ avgRating: -1 });
SupplierSchema.index({ name: 1 });
SupplierSchema.index({ 'location.country': 1, 'location.city': 1 });

// Virtuals
// coffees
SupplierSchema.virtual('coffees', {
  ref: 'Coffee',
  localField: '_id',
  foreignField: 'supplier._id',
  justOne: false,
});

export default mongoose.model<ISupplierDocument>('Supplier', SupplierSchema);
