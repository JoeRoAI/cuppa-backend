import PrivacySettings, { IPrivacySettings } from '../models/privacy-settings.model';
import { SocialConnection } from '../models/social-connection.model';
import mongoose from 'mongoose';

export class PrivacySettingsService {
  /**
   * Get privacy settings for a user, creating default settings if none exist
   */
  async getPrivacySettings(userId: string): Promise<IPrivacySettings> {
    try {
      let settings = await PrivacySettings.findOne({ userId });

      if (!settings) {
        // Create default privacy settings for new users
        settings = await PrivacySettings.create({ userId });
      }

      return settings;
    } catch (error) {
      console.error('Error getting privacy settings:', error);
      throw new Error('Failed to get privacy settings');
    }
  }

  /**
   * Update privacy settings for a user
   */
  async updatePrivacySettings(
    userId: string,
    updates: Partial<IPrivacySettings>
  ): Promise<IPrivacySettings> {
    try {
      // Remove fields that shouldn't be updated directly
      const { userId: _, createdAt, updatedAt, ...allowedUpdates } = updates;

      const settings = await PrivacySettings.findOneAndUpdate({ userId }, allowedUpdates, {
        new: true,
        upsert: true,
        runValidators: true,
      });

      if (!settings) {
        throw new Error('Failed to update privacy settings');
      }

      return settings;
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      throw new Error('Failed to update privacy settings');
    }
  }

  /**
   * Check if a user can view another user's profile
   */
  async canViewProfile(viewerId: string, targetUserId: string): Promise<boolean> {
    try {
      if (viewerId === targetUserId) {
        return true; // Users can always view their own profile
      }

      const settings = await this.getPrivacySettings(targetUserId);

      switch (settings.profileVisibility) {
        case 'public':
          return true;
        case 'private':
          return false;
        case 'friends':
          return await this.areUsersFriends(viewerId, targetUserId);
        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking profile visibility:', error);
      return false;
    }
  }

  /**
   * Check if a user can view another user's activities
   */
  async canViewActivities(viewerId: string, targetUserId: string): Promise<boolean> {
    try {
      if (viewerId === targetUserId) {
        return true; // Users can always view their own activities
      }

      const settings = await this.getPrivacySettings(targetUserId);

      switch (settings.activityVisibility) {
        case 'public':
          return true;
        case 'private':
          return false;
        case 'friends':
          return await this.areUsersFriends(viewerId, targetUserId);
        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking activity visibility:', error);
      return false;
    }
  }

  /**
   * Check if a user can follow another user
   */
  async canFollow(followerId: string, targetUserId: string): Promise<boolean> {
    try {
      if (followerId === targetUserId) {
        return false; // Users cannot follow themselves
      }

      const settings = await this.getPrivacySettings(targetUserId);
      return settings.allowFollowing;
    } catch (error) {
      console.error('Error checking follow permission:', error);
      return false;
    }
  }

  /**
   * Check if a user can comment on another user's content
   */
  async canComment(commenterId: string, targetUserId: string): Promise<boolean> {
    try {
      if (commenterId === targetUserId) {
        return true; // Users can always comment on their own content
      }

      const settings = await this.getPrivacySettings(targetUserId);

      if (!settings.allowComments) {
        return false;
      }

      // Additional check based on activity visibility
      return await this.canViewActivities(commenterId, targetUserId);
    } catch (error) {
      console.error('Error checking comment permission:', error);
      return false;
    }
  }

  /**
   * Check if a user can like another user's content
   */
  async canLike(likerId: string, targetUserId: string): Promise<boolean> {
    try {
      if (likerId === targetUserId) {
        return true; // Users can always like their own content
      }

      const settings = await this.getPrivacySettings(targetUserId);

      if (!settings.allowLikes) {
        return false;
      }

      // Additional check based on activity visibility
      return await this.canViewActivities(likerId, targetUserId);
    } catch (error) {
      console.error('Error checking like permission:', error);
      return false;
    }
  }

  /**
   * Check if a user should appear in suggestions for another user
   */
  async shouldShowInSuggestions(viewerId: string, targetUserId: string): Promise<boolean> {
    try {
      if (viewerId === targetUserId) {
        return false; // Don't suggest users to themselves
      }

      const settings = await this.getPrivacySettings(targetUserId);
      return settings.showInSuggestions;
    } catch (error) {
      console.error('Error checking suggestion visibility:', error);
      return false;
    }
  }

  /**
   * Check if a user should appear in leaderboards
   */
  async shouldShowInLeaderboards(userId: string): Promise<boolean> {
    try {
      const settings = await this.getPrivacySettings(userId);
      return settings.showInLeaderboards;
    } catch (error) {
      console.error('Error checking leaderboard visibility:', error);
      return false;
    }
  }

  /**
   * Get filtered user data based on privacy settings
   */
  async getFilteredUserData(viewerId: string, targetUser: any): Promise<any> {
    try {
      const settings = await this.getPrivacySettings(targetUser._id.toString());
      const canViewProfile = await this.canViewProfile(viewerId, targetUser._id.toString());

      if (!canViewProfile) {
        return {
          _id: targetUser._id,
          name: settings.showRealName ? targetUser.name : 'Private User',
          profileImage: settings.showProfileImage ? targetUser.profileImage : null,
        };
      }

      const filteredUser: Record<string, any> = {
        _id: targetUser._id,
        name: settings.showRealName ? targetUser.name : 'Private User',
        email: settings.showEmail ? targetUser.email : undefined,
        profileImage: settings.showProfileImage ? targetUser.profileImage : null,
        createdAt: settings.showJoinDate ? targetUser.createdAt : undefined,
        role: targetUser.role,
      };

      // Remove undefined fields
      Object.keys(filteredUser).forEach((key) => {
        if (filteredUser[key] === undefined) {
          delete filteredUser[key];
        }
      });

      return filteredUser;
    } catch (error) {
      console.error('Error filtering user data:', error);
      throw new Error('Failed to filter user data');
    }
  }

  /**
   * Check if two users are friends (following each other)
   */
  private async areUsersFriends(userId1: string, userId2: string): Promise<boolean> {
    try {
      const connection1 = await SocialConnection.findOne({
        followerId: userId1,
        followedId: userId2,
        status: 'active',
      });

      const connection2 = await SocialConnection.findOne({
        followerId: userId2,
        followedId: userId1,
        status: 'active',
      });

      return !!(connection1 && connection2);
    } catch (error) {
      console.error('Error checking friendship status:', error);
      return false;
    }
  }

  /**
   * Create default privacy settings for a new user
   */
  async createDefaultSettings(userId: string): Promise<IPrivacySettings> {
    try {
      const settings = await PrivacySettings.create({ userId });
      return settings;
    } catch (error) {
      console.error('Error creating default privacy settings:', error);
      throw new Error('Failed to create default privacy settings');
    }
  }

  /**
   * Delete privacy settings for a user (for account deletion)
   */
  async deletePrivacySettings(userId: string): Promise<void> {
    try {
      await PrivacySettings.deleteOne({ userId });
    } catch (error) {
      console.error('Error deleting privacy settings:', error);
      throw new Error('Failed to delete privacy settings');
    }
  }

  /**
   * Get privacy settings for multiple users (for bulk operations)
   */
  async getBulkPrivacySettings(userIds: string[]): Promise<Map<string, IPrivacySettings>> {
    try {
      const settings = await PrivacySettings.find({
        userId: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });

      const settingsMap = new Map<string, IPrivacySettings>();

      for (const setting of settings) {
        settingsMap.set(setting.userId.toString(), setting);
      }

      // Create default settings for users who don't have any
      for (const userId of userIds) {
        if (!settingsMap.has(userId)) {
          const defaultSettings = await this.createDefaultSettings(userId);
          settingsMap.set(userId, defaultSettings);
        }
      }

      return settingsMap;
    } catch (error) {
      console.error('Error getting bulk privacy settings:', error);
      throw new Error('Failed to get bulk privacy settings');
    }
  }
}

export default new PrivacySettingsService();
