import { Request, Response } from 'express';
import privacySettingsService from '../services/privacy-settings.service';
import { IPrivacySettings } from '../models/privacy-settings.model';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    name: string;
  };
}

export class PrivacySettingsController {
  /**
   * Get privacy settings for the authenticated user
   */
  async getPrivacySettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const settings = await privacySettingsService.getPrivacySettings(req.user.id);

      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error('Error getting privacy settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get privacy settings',
      });
    }
  }

  /**
   * Update privacy settings for the authenticated user
   */
  async updatePrivacySettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const updates = req.body;

      // Validate the updates
      const validationError = this.validatePrivacySettings(updates);
      if (validationError) {
        res.status(400).json({
          success: false,
          message: validationError,
        });
        return;
      }

      const settings = await privacySettingsService.updatePrivacySettings(req.user.id, updates);

      res.status(200).json({
        success: true,
        data: settings,
        message: 'Privacy settings updated successfully',
      });
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update privacy settings',
      });
    }
  }

  /**
   * Get privacy settings for a specific user (admin only)
   */
  async getUserPrivacySettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      if (req.user.role !== 'admin') {
        res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
        return;
      }

      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
        return;
      }

      const settings = await privacySettingsService.getPrivacySettings(userId);

      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error('Error getting user privacy settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user privacy settings',
      });
    }
  }

  /**
   * Check if a user can view another user's profile
   */
  async checkProfileVisibility(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const { targetUserId } = req.params;

      if (!targetUserId) {
        res.status(400).json({
          success: false,
          message: 'Target user ID is required',
        });
        return;
      }

      const canView = await privacySettingsService.canViewProfile(req.user.id, targetUserId);

      res.status(200).json({
        success: true,
        data: {
          canViewProfile: canView,
        },
      });
    } catch (error) {
      console.error('Error checking profile visibility:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check profile visibility',
      });
    }
  }

  /**
   * Check if a user can view another user's activities
   */
  async checkActivityVisibility(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const { targetUserId } = req.params;

      if (!targetUserId) {
        res.status(400).json({
          success: false,
          message: 'Target user ID is required',
        });
        return;
      }

      const canView = await privacySettingsService.canViewActivities(req.user.id, targetUserId);

      res.status(200).json({
        success: true,
        data: {
          canViewActivities: canView,
        },
      });
    } catch (error) {
      console.error('Error checking activity visibility:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check activity visibility',
      });
    }
  }

  /**
   * Get filtered user data based on privacy settings
   */
  async getFilteredUserData(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const { targetUserId } = req.params;

      if (!targetUserId) {
        res.status(400).json({
          success: false,
          message: 'Target user ID is required',
        });
        return;
      }

      // This would typically get the user data from a user service
      // For now, we'll return a placeholder response
      res.status(200).json({
        success: true,
        message: 'This endpoint would return filtered user data based on privacy settings',
      });
    } catch (error) {
      console.error('Error getting filtered user data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get filtered user data',
      });
    }
  }

  /**
   * Reset privacy settings to defaults
   */
  async resetPrivacySettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      // Delete existing settings to trigger creation of defaults
      await privacySettingsService.deletePrivacySettings(req.user.id);
      const settings = await privacySettingsService.createDefaultSettings(req.user.id);

      res.status(200).json({
        success: true,
        data: settings,
        message: 'Privacy settings reset to defaults',
      });
    } catch (error) {
      console.error('Error resetting privacy settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset privacy settings',
      });
    }
  }

  /**
   * Validate privacy settings updates
   */
  private validatePrivacySettings(updates: Partial<IPrivacySettings>): string | null {
    const validVisibilityOptions = ['public', 'friends', 'private'];

    if (updates.profileVisibility && !validVisibilityOptions.includes(updates.profileVisibility)) {
      return 'Invalid profile visibility option';
    }

    if (
      updates.activityVisibility &&
      !validVisibilityOptions.includes(updates.activityVisibility)
    ) {
      return 'Invalid activity visibility option';
    }

    // Validate boolean fields
    const booleanFields = [
      'showEmail',
      'showRealName',
      'showProfileImage',
      'showJoinDate',
      'showCheckIns',
      'showRatings',
      'showReviews',
      'showBookmarks',
      'showTasteProfile',
      'allowFollowing',
      'allowComments',
      'allowLikes',
      'allowMentions',
      'allowDirectMessages',
      'discoverableByEmail',
      'discoverableByName',
      'showInSuggestions',
      'showInLeaderboards',
      'notifyOnFollow',
      'notifyOnComment',
      'notifyOnLike',
      'notifyOnMention',
      'notifyOnDirectMessage',
      'allowDataForRecommendations',
      'allowAnalytics',
      'allowThirdPartySharing',
    ];

    for (const field of booleanFields) {
      if (
        updates[field as keyof IPrivacySettings] !== undefined &&
        typeof updates[field as keyof IPrivacySettings] !== 'boolean'
      ) {
        return `Field ${field} must be a boolean value`;
      }
    }

    return null;
  }
}

export default new PrivacySettingsController();
