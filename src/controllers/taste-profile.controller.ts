/**
 * taste-profile.controller.ts
 * Controller for taste profile operations and management
 */

import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import TasteProfileAggregationService from '../services/taste-profile-aggregation.service';
import TasteProfileAlgorithmsService from '../services/taste-profile-algorithms.service';
import logger from '../utils/logger';

/**
 * Get user's taste profile
 * @route GET /api/taste-profile
 * @access Private
 */
export const getUserTasteProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;

    // Get existing taste profile
    let tasteProfile = await TasteProfileAggregationService.getTasteProfile(userId);

    // If no profile exists or it's stale, generate a new one
    if (!tasteProfile) {
      logger.info(`No taste profile found for user ${userId}, generating new profile`);
      tasteProfile = await TasteProfileAggregationService.generateTasteProfile(userId);
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: tasteProfile,
    });
  } catch (error: any) {
    logger.error(`Error getting taste profile: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error retrieving taste profile',
      error: error.message,
    });
  }
};

/**
 * Generate/regenerate user's taste profile
 * @route POST /api/taste-profile/generate
 * @access Private
 */
export const generateTasteProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;

    logger.info(`Generating taste profile for user ${userId}`);
    const tasteProfile = await TasteProfileAggregationService.generateTasteProfile(userId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Taste profile generated successfully',
      data: tasteProfile,
    });
  } catch (error: any) {
    logger.error(`Error generating taste profile: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error generating taste profile',
      error: error.message,
    });
  }
};

/**
 * Get taste profile summary (simplified version for UI)
 * @route GET /api/taste-profile/summary
 * @access Private
 */
export const getTasteProfileSummary = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;

    const tasteProfile = await TasteProfileAggregationService.getTasteProfile(userId);

    if (!tasteProfile) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Taste profile not found. Please rate some coffees first.',
      });
    }

    // Create a simplified summary for the frontend
    const summary = {
      profileConfidence: tasteProfile.profileConfidence,
      totalRatings: tasteProfile.totalRatings,
      lastUpdated: tasteProfile.lastCalculated,

      // Top 5 preferred attributes
      topAttributes: tasteProfile.preferredAttributes
        .filter((attr) => attr.confidence > 20) // Only include attributes with reasonable confidence
        .sort((a, b) => b.preferenceScore - a.preferenceScore)
        .slice(0, 5)
        .map((attr) => ({
          attribute: attr.attribute,
          score: attr.preferenceScore,
          confidence: attr.confidence,
          averageRating: attr.averageRating,
        })),

      // Top 5 flavor preferences
      topFlavors: tasteProfile.preferredFlavorProfiles
        .sort((a, b) => b.preferenceScore - a.preferenceScore)
        .slice(0, 5)
        .map((flavor) => ({
          flavor: flavor.flavorNote,
          score: flavor.preferenceScore,
          frequency: flavor.frequency,
          averageRating: flavor.averageRating,
        })),

      // Preferred characteristics
      preferredRoastLevel: tasteProfile.preferredCharacteristics.roastLevels[0] || null,
      preferredOrigin: tasteProfile.preferredCharacteristics.origins[0] || null,
      preferredProcessing: tasteProfile.preferredCharacteristics.processingMethods[0] || null,

      // Rating patterns
      averageRating: tasteProfile.ratingPatterns.averageOverallRating,
      ratingConsistency: Math.max(0, 100 - tasteProfile.ratingPatterns.ratingVariance * 20), // Convert variance to consistency score
      mostActiveTime: tasteProfile.ratingPatterns.mostActiveTimeOfDay,
      mostActiveDay: tasteProfile.ratingPatterns.mostActiveDay,
    };

    res.status(StatusCodes.OK).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    logger.error(`Error getting taste profile summary: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error retrieving taste profile summary',
      error: error.message,
    });
  }
};

/**
 * Get taste profile attributes for visualization
 * @route GET /api/taste-profile/attributes
 * @access Private
 */
export const getTasteProfileAttributes = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;

    const tasteProfile = await TasteProfileAggregationService.getTasteProfile(userId);

    if (!tasteProfile) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Taste profile not found',
      });
    }

    // Format attributes for radar chart visualization
    const attributesForVisualization = tasteProfile.preferredAttributes.map((attr) => ({
      name: attr.attribute,
      value: attr.preferenceScore,
      confidence: attr.confidence,
      averageRating: attr.averageRating,
      ratingCount: attr.ratingCount,
      // Normalize value for radar chart (0-5 scale)
      normalizedValue: (attr.preferenceScore / 100) * 5,
    }));

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        attributes: attributesForVisualization,
        profileConfidence: tasteProfile.profileConfidence,
        totalRatings: tasteProfile.totalRatings,
        lastUpdated: tasteProfile.lastCalculated,
      },
    });
  } catch (error: any) {
    logger.error(`Error getting taste profile attributes: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error retrieving taste profile attributes',
      error: error.message,
    });
  }
};

/**
 * Get taste profile flavor preferences
 * @route GET /api/taste-profile/flavors
 * @access Private
 */
export const getTasteProfileFlavors = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 10;

    const tasteProfile = await TasteProfileAggregationService.getTasteProfile(userId);

    if (!tasteProfile) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Taste profile not found',
      });
    }

    // Get top flavor preferences
    const topFlavors = tasteProfile.preferredFlavorProfiles
      .sort((a, b) => b.preferenceScore - a.preferenceScore)
      .slice(0, limit)
      .map((flavor) => ({
        name: flavor.flavorNote,
        preferenceScore: flavor.preferenceScore,
        frequency: flavor.frequency,
        averageRating: flavor.averageRating,
        // Normalize for bar chart visualization
        intensity: (flavor.preferenceScore / 100) * 10,
      }));

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        flavors: topFlavors,
        totalFlavors: tasteProfile.preferredFlavorProfiles.length,
        profileConfidence: tasteProfile.profileConfidence,
      },
    });
  } catch (error: any) {
    logger.error(`Error getting taste profile flavors: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error retrieving taste profile flavors',
      error: error.message,
    });
  }
};

/**
 * Get taste profile statistics
 * @route GET /api/taste-profile/stats
 * @access Private
 */
export const getTasteProfileStats = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;

    const tasteProfile = await TasteProfileAggregationService.getTasteProfile(userId);

    if (!tasteProfile) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Taste profile not found',
      });
    }

    const stats = {
      overview: {
        totalRatings: tasteProfile.totalRatings,
        profileConfidence: tasteProfile.profileConfidence,
        averageRating: tasteProfile.ratingPatterns.averageOverallRating,
        ratingVariance: tasteProfile.ratingPatterns.ratingVariance,
        lastRatingDate: tasteProfile.lastRatingDate,
        lastCalculated: tasteProfile.lastCalculated,
      },

      ratingDistribution: tasteProfile.ratingPatterns.overallRatingDistribution,

      preferences: {
        roastLevels: tasteProfile.preferredCharacteristics.roastLevels,
        origins: tasteProfile.preferredCharacteristics.origins,
        processingMethods: tasteProfile.preferredCharacteristics.processingMethods,
      },

      behavior: {
        mostActiveTimeOfDay: tasteProfile.ratingPatterns.mostActiveTimeOfDay,
        mostActiveDay: tasteProfile.ratingPatterns.mostActiveDay,
        ratingTrends: tasteProfile.ratingPatterns.ratingTrends,
      },
    };

    res.status(StatusCodes.OK).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error(`Error getting taste profile stats: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error retrieving taste profile statistics',
      error: error.message,
    });
  }
};

/**
 * Calculate user affinity with another user
 * @route GET /api/taste-profile/affinity/user/:targetUserId
 * @access Private
 */
export const calculateUserAffinity = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;
    const { targetUserId } = req.params;

    if (!targetUserId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Target user ID is required',
      });
    }

    const affinityScore = await TasteProfileAlgorithmsService.calculateUserAffinity(
      userId,
      targetUserId
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        userId1: userId,
        userId2: targetUserId,
        affinityScore,
        affinityPercentage: Math.round(affinityScore * 100),
        compatibility: affinityScore > 0.7 ? 'high' : affinityScore > 0.4 ? 'medium' : 'low',
      },
    });
  } catch (error: any) {
    logger.error(`Error calculating user affinity: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error calculating user affinity',
      error: error.message,
    });
  }
};

/**
 * Calculate coffee affinity for a user
 * @route GET /api/taste-profile/affinity/coffee/:coffeeId
 * @access Private
 */
export const calculateCoffeeAffinity = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;
    const { coffeeId } = req.params;

    if (!coffeeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Coffee ID is required',
      });
    }

    const coffeeAffinity = await TasteProfileAlgorithmsService.calculateCoffeeAffinity(
      userId,
      coffeeId
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        userId,
        ...coffeeAffinity,
        affinityPercentage: Math.round(coffeeAffinity.affinityScore * 100),
        recommendation:
          coffeeAffinity.affinityScore > 0.7
            ? 'highly recommended'
            : coffeeAffinity.affinityScore > 0.4
              ? 'recommended'
              : 'might not be your taste',
      },
    });
  } catch (error: any) {
    logger.error(`Error calculating coffee affinity: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error calculating coffee affinity',
      error: error.message,
    });
  }
};

/**
 * Find users with similar taste profiles
 * @route GET /api/taste-profile/similar-users
 * @access Private
 */
export const findSimilarUsers = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 10;

    const similarUsers = await TasteProfileAlgorithmsService.findSimilarUsers(userId, limit);

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        userId,
        similarUsers: similarUsers.map((user) => ({
          ...user,
          affinityPercentage: Math.round(user.affinityScore * 100),
          compatibility:
            user.affinityScore > 0.7 ? 'high' : user.affinityScore > 0.4 ? 'medium' : 'low',
        })),
        totalFound: similarUsers.length,
      },
    });
  } catch (error: any) {
    logger.error(`Error finding similar users: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error finding similar users',
      error: error.message,
    });
  }
};

/**
 * Refine taste profile using collaborative filtering
 * @route POST /api/taste-profile/refine
 * @access Private
 */
export const refineProfileWithCollaborativeFiltering = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userId = req.user.id;

    const refinedProfile =
      await TasteProfileAlgorithmsService.refineProfileWithCollaborativeFiltering(userId);

    if (!refinedProfile) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Taste profile not found or could not be refined',
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Taste profile refined successfully using collaborative filtering',
      data: refinedProfile,
    });
  } catch (error: any) {
    logger.error(`Error refining taste profile: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error refining taste profile',
      error: error.message,
    });
  }
};

/**
 * Admin endpoint: Get stale profiles that need updating
 * @route GET /api/taste-profile/admin/stale
 * @access Private (Admin only)
 */
export const getStaleProfiles = async (req: Request, res: Response) => {
  try {
    const hoursThreshold = parseInt(req.query.hours as string) || 24;

    const staleUserIds = await TasteProfileAggregationService.getStaleProfiles(hoursThreshold);

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        staleProfiles: staleUserIds,
        count: staleUserIds.length,
        hoursThreshold,
      },
    });
  } catch (error: any) {
    logger.error(`Error getting stale profiles: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error retrieving stale profiles',
      error: error.message,
    });
  }
};

/**
 * Admin endpoint: Batch update stale profiles
 * @route POST /api/taste-profile/admin/batch-update
 * @access Private (Admin only)
 */
export const batchUpdateProfiles = async (req: Request, res: Response) => {
  try {
    const { userIds, hoursThreshold } = req.body;

    let targetUserIds = userIds;

    // If no specific user IDs provided, get stale profiles
    if (!targetUserIds || targetUserIds.length === 0) {
      targetUserIds = await TasteProfileAggregationService.getStaleProfiles(hoursThreshold || 24);
    }

    if (targetUserIds.length === 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'No profiles need updating',
        data: { updatedCount: 0, totalCount: 0 },
      });
    }

    const updatedCount = await TasteProfileAggregationService.batchUpdateProfiles(targetUserIds);

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Batch update completed: ${updatedCount}/${targetUserIds.length} profiles updated`,
      data: {
        updatedCount,
        totalCount: targetUserIds.length,
        userIds: targetUserIds,
      },
    });
  } catch (error: any) {
    logger.error(`Error in batch update: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error in batch profile update',
      error: error.message,
    });
  }
};

/**
 * Admin endpoint: Cluster users by taste profiles
 * @route POST /api/taste-profile/admin/cluster
 * @access Private (Admin only)
 */
export const clusterUsersByTaste = async (req: Request, res: Response) => {
  try {
    const { k = 5 } = req.body;

    const clusters = await TasteProfileAlgorithmsService.clusterUsersByTaste(k);

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Successfully clustered users into ${clusters.length} taste groups`,
      data: {
        clusters,
        totalClusters: clusters.length,
        requestedClusters: k,
      },
    });
  } catch (error: any) {
    logger.error(`Error clustering users by taste: ${error.message}`);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error clustering users by taste',
      error: error.message,
    });
  }
};

/**
 * Manually trigger a taste profile update for a user
 * POST /api/taste-profile/update/:userId
 */
export const triggerUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { force = false, updateType = 'auto' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
      return;
    }

    // Import the update service
    const TasteProfileUpdateService = (await import('../services/taste-profile-update.service'))
      .default;

    // Trigger the update
    const result = await TasteProfileUpdateService.triggerUpdate(userId, 'manual', undefined, {
      force,
      updateType,
    });

    res.status(200).json({
      success: true,
      message: 'Update triggered successfully',
      data: result,
    });
  } catch (error: any) {
    logger.error('Error triggering taste profile update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger update',
      error: error.message,
    });
  }
};

/**
 * Get update queue status
 * GET /api/taste-profile/update/queue-status
 */
export const getQueueStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const TasteProfileUpdateService = (await import('../services/taste-profile-update.service'))
      .default;
    const status = TasteProfileUpdateService.getQueueStatus();

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    logger.error('Error getting queue status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue status',
      error: error.message,
    });
  }
};

/**
 * Get update configuration
 * GET /api/taste-profile/update/config
 */
export const getUpdateConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const TasteProfileUpdateService = (await import('../services/taste-profile-update.service'))
      .default;
    const config = TasteProfileUpdateService.getConfiguration();

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    logger.error('Error getting update config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get configuration',
      error: error.message,
    });
  }
};

/**
 * Update configuration
 * PUT /api/taste-profile/update/config
 */
export const updateConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const TasteProfileUpdateService = (await import('../services/taste-profile-update.service'))
      .default;
    const newConfig = TasteProfileUpdateService.updateConfiguration(req.body);

    res.status(200).json({
      success: true,
      message: 'Configuration updated successfully',
      data: newConfig,
    });
  } catch (error: any) {
    logger.error('Error updating config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update configuration',
      error: error.message,
    });
  }
};

/**
 * Process pending updates in queue
 * POST /api/taste-profile/update/process-queue
 */
export const processQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const TasteProfileUpdateService = (await import('../services/taste-profile-update.service'))
      .default;
    const result = await TasteProfileUpdateService.processPendingUpdates();

    res.status(200).json({
      success: true,
      message: 'Queue processing completed',
      data: result,
    });
  } catch (error: any) {
    logger.error('Error processing queue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process queue',
      error: error.message,
    });
  }
};

/**
 * Get update history for a user
 * GET /api/taste-profile/update/history/:userId
 */
export const getUpdateHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
      return;
    }

    const TasteProfileUpdateService = (await import('../services/taste-profile-update.service'))
      .default;
    const history = TasteProfileUpdateService.getUpdateHistory(userId, Number(limit));

    res.status(200).json({
      success: true,
      data: {
        userId,
        ...history,
      },
    });
  } catch (error: any) {
    logger.error('Error getting update history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get update history',
      error: error.message,
    });
  }
};
