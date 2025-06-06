import mongoose, { Document, Schema } from 'mongoose';

// Guide Category Interface
export interface IGuideCategory extends Document {
  name: string;
  description: string;
  slug: string;
  icon?: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Guide Tag Interface
export interface IGuideTag extends Document {
  name: string;
  slug: string;
  color?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Guide Interface
export interface IGuide extends Document {
  title: string;
  slug: string;
  description: string;
  content: string;
  excerpt: string;
  featuredImage?: string;
  images: string[];
  category: mongoose.Types.ObjectId;
  tags: mongoose.Types.ObjectId[];
  author: mongoose.Types.ObjectId;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: number; // in minutes
  equipment: string[];
  ingredients: string[];
  steps: {
    stepNumber: number;
    title: string;
    description: string;
    image?: string;
    duration?: number; // in minutes
    tips?: string[];
  }[];
  relatedGuides: mongoose.Types.ObjectId[];
  isPublished: boolean;
  isFeatured: boolean;
  viewCount: number;
  bookmarkCount: number;
  rating: {
    average: number;
    count: number;
  };
  seo: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
  };
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Guide Category Schema
const GuideCategorySchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Guide Tag Schema
const GuideTagSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Guide Schema
const GuideSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    content: {
      type: String,
      required: true,
    },
    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    featuredImage: {
      type: String,
      trim: true,
    },
    images: [
      {
        type: String,
        trim: true,
      },
    ],
    category: {
      type: Schema.Types.ObjectId,
      ref: 'GuideCategory',
      required: true,
    },
    tags: [
      {
        type: Schema.Types.ObjectId,
        ref: 'GuideTag',
      },
    ],
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    estimatedTime: {
      type: Number,
      min: 1,
      max: 480, // 8 hours max
    },
    equipment: [
      {
        type: String,
        trim: true,
      },
    ],
    ingredients: [
      {
        type: String,
        trim: true,
      },
    ],
    steps: [
      {
        stepNumber: {
          type: Number,
          required: true,
          min: 1,
        },
        title: {
          type: String,
          required: true,
          trim: true,
          maxlength: 100,
        },
        description: {
          type: String,
          required: true,
          trim: true,
        },
        image: {
          type: String,
          trim: true,
        },
        duration: {
          type: Number,
          min: 0,
        },
        tips: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],
    relatedGuides: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Guide',
      },
    ],
    isPublished: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    bookmarkCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    seo: {
      metaTitle: {
        type: String,
        trim: true,
        maxlength: 60,
      },
      metaDescription: {
        type: String,
        trim: true,
        maxlength: 160,
      },
      keywords: [
        {
          type: String,
          trim: true,
        },
      ],
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
GuideSchema.index({ slug: 1 });
GuideSchema.index({ category: 1, isPublished: 1 });
GuideSchema.index({ tags: 1, isPublished: 1 });
GuideSchema.index({ difficulty: 1, isPublished: 1 });
GuideSchema.index({ isFeatured: 1, isPublished: 1 });
GuideSchema.index({ publishedAt: -1 });
GuideSchema.index({ viewCount: -1 });
GuideSchema.index({ 'rating.average': -1 });

GuideCategorySchema.index({ slug: 1 });
GuideCategorySchema.index({ order: 1, isActive: 1 });

GuideTagSchema.index({ slug: 1 });
GuideTagSchema.index({ isActive: 1 });

// Pre-save middleware to generate slug and set publishedAt
GuideSchema.pre('save', function (this: IGuide, next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  if (this.isModified('isPublished') && this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  next();
});

GuideCategorySchema.pre('save', function (this: IGuideCategory, next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

GuideTagSchema.pre('save', function (this: IGuideTag, next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// Export models
export const GuideCategory = mongoose.model<IGuideCategory>('GuideCategory', GuideCategorySchema);
export const GuideTag = mongoose.model<IGuideTag>('GuideTag', GuideTagSchema);
export const Guide = mongoose.model<IGuide>('Guide', GuideSchema);
