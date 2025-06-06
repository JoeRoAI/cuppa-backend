import mongoose, { Schema, Document } from 'mongoose';

export interface IPrivacySettings extends Document {
  userId: mongoose.Types.ObjectId;

  // Profile visibility settings
  profileVisibility: 'public' | 'friends' | 'private';
  showEmail: boolean;
  showRealName: boolean;
  showProfileImage: boolean;
  showJoinDate: boolean;

  // Activity visibility settings
  activityVisibility: 'public' | 'friends' | 'private';
  showCheckIns: boolean;
  showRatings: boolean;
  showReviews: boolean;
  showBookmarks: boolean;
  showTasteProfile: boolean;

  // Social interaction settings
  allowFollowing: boolean;
  allowComments: boolean;
  allowLikes: boolean;
  allowMentions: boolean;
  allowDirectMessages: boolean;

  // Discovery settings
  discoverableByEmail: boolean;
  discoverableByName: boolean;
  showInSuggestions: boolean;
  showInLeaderboards: boolean;

  // Notification settings
  notifyOnFollow: boolean;
  notifyOnComment: boolean;
  notifyOnLike: boolean;
  notifyOnMention: boolean;
  notifyOnDirectMessage: boolean;

  // Data sharing settings
  allowDataForRecommendations: boolean;
  allowAnalytics: boolean;
  allowThirdPartySharing: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const PrivacySettingsSchema = new Schema<IPrivacySettings>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // Profile visibility settings
    profileVisibility: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public',
    },
    showEmail: {
      type: Boolean,
      default: false,
    },
    showRealName: {
      type: Boolean,
      default: true,
    },
    showProfileImage: {
      type: Boolean,
      default: true,
    },
    showJoinDate: {
      type: Boolean,
      default: true,
    },

    // Activity visibility settings
    activityVisibility: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public',
    },
    showCheckIns: {
      type: Boolean,
      default: true,
    },
    showRatings: {
      type: Boolean,
      default: true,
    },
    showReviews: {
      type: Boolean,
      default: true,
    },
    showBookmarks: {
      type: Boolean,
      default: false,
    },
    showTasteProfile: {
      type: Boolean,
      default: true,
    },

    // Social interaction settings
    allowFollowing: {
      type: Boolean,
      default: true,
    },
    allowComments: {
      type: Boolean,
      default: true,
    },
    allowLikes: {
      type: Boolean,
      default: true,
    },
    allowMentions: {
      type: Boolean,
      default: true,
    },
    allowDirectMessages: {
      type: Boolean,
      default: true,
    },

    // Discovery settings
    discoverableByEmail: {
      type: Boolean,
      default: false,
    },
    discoverableByName: {
      type: Boolean,
      default: true,
    },
    showInSuggestions: {
      type: Boolean,
      default: true,
    },
    showInLeaderboards: {
      type: Boolean,
      default: true,
    },

    // Notification settings
    notifyOnFollow: {
      type: Boolean,
      default: true,
    },
    notifyOnComment: {
      type: Boolean,
      default: true,
    },
    notifyOnLike: {
      type: Boolean,
      default: true,
    },
    notifyOnMention: {
      type: Boolean,
      default: true,
    },
    notifyOnDirectMessage: {
      type: Boolean,
      default: true,
    },

    // Data sharing settings
    allowDataForRecommendations: {
      type: Boolean,
      default: true,
    },
    allowAnalytics: {
      type: Boolean,
      default: true,
    },
    allowThirdPartySharing: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
PrivacySettingsSchema.index({ userId: 1 });

const PrivacySettings = mongoose.model<IPrivacySettings>('PrivacySettings', PrivacySettingsSchema);

export default PrivacySettings;
