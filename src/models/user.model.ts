import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { RefreshToken } from '../utils/jwt.service';

// Interface for social authentication providers
export interface SocialAuthProvider {
  id: string;
  token: string;
  name: string;
  email: string;
}

// Interface for social authentication
export interface SocialAuth {
  google?: SocialAuthProvider;
  facebook?: SocialAuthProvider;
  github?: SocialAuthProvider;
  apple?: SocialAuthProvider;
  [key: string]: SocialAuthProvider | undefined;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string;
  profileImage?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaType?: string;
  knownDevices: string[];
  knownIPs: string[];
  lastLogin?: Date;
  loginAttempts: number;
  refreshTokens: RefreshToken[];
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  preferences: {
    roastLevel: string[];
    flavorProfile: string[];
    brewMethods: string[];
  };
  savedCoffees: mongoose.Types.ObjectId[];
  ratingsHistory: Array<{
    coffeeId: mongoose.Types.ObjectId;
    rating: number;
    review?: string;
    date: Date;
  }>;
  socialAuth?: SocialAuth;
  createdAt: Date;
  updatedAt: Date;
  matchPassword(enteredPassword: string): Promise<boolean>;
  getSignedJwtToken(): string;
}

// Define the schema
const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        'Please provide a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    profileImage: {
      type: String,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaSecret: {
      type: String,
      select: false,
    },
    mfaType: {
      type: String,
      enum: ['totp', 'sms'],
      default: 'totp',
    },
    knownDevices: {
      type: [String],
      default: [],
    },
    knownIPs: {
      type: [String],
      default: [],
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      select: false,
    },
    refreshTokens: {
      type: [
        {
          token: String,
          tokenId: String,
          expires: Date,
          createdAt: Date,
          createdByIp: String,
          isRevoked: Boolean,
          revokedAt: Date,
          replacedByTokenId: String,
        },
      ],
      select: false,
      default: [],
    },
    preferences: {
      roastLevel: {
        type: [String],
        default: [],
      },
      flavorProfile: {
        type: [String],
        default: [],
      },
      brewMethods: {
        type: [String],
        default: [],
      },
    },
    savedCoffees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coffee',
      },
    ],
    ratingsHistory: [
      {
        coffeeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Coffee',
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        review: String,
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    socialAuth: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt password using bcrypt before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match entered password with hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword: string) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
  // This functionality has been moved to jwt.service.ts
  // This method is kept for backward compatibility
  return require('../utils/jwt.service').default.generateAccessToken(this);
};

const User = mongoose.model<IUser>('User', UserSchema);

export default User;
