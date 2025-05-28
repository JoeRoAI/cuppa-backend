/**
 * PersonalizationService.ts
 * Service for user modeling and personalization features to enhance the recommendation engine.
 */

import mongoose from 'mongoose';
import { UserInteraction, IUserInteraction } from '../models/recommendation.model';
import User, { IUser } from '../models/user.model';
import logger from '../utils/logger';

// Configuration for personalization features
const PERSONALIZATION_CONFIG = {
  // Time weights for recent vs older behaviors
  TIME_WEIGHTS: {
    VERY_RECENT: 1.0, // Last 24 hours
    RECENT: 0.8, // Last week
    MEDIUM: 0.5, // Last month
    OLD: 0.2, // Older than a month
  },

  // Interaction type weights
  INTERACTION_WEIGHTS: {
    purchase: 1.0,
    rating: 0.9,
    favorite: 0.8,
    review: 0.7,
    share: 0.6,
    click: 0.4,
    view: 0.2,
    search: 0.3,
  },

  // Context weights
  CONTEXT_WEIGHTS: {
    time_of_day: 0.7,
    day_of_week: 0.5,
    location: 0.6,
    device: 0.4,
  },

  // Number of days to consider for recency calculations
  RECENCY_PERIODS: {
    VERY_RECENT: 1,
    RECENT: 7,
    MEDIUM: 30,
    OLD: 90,
  },

  // Feature importance for taste model
  FEATURE_IMPORTANCE: {
    explicit_preferences: 0.7,
    implicit_behaviors: 0.9,
    social_signals: 0.4,
  },

  // Novelty vs familiarity balance (higher means more novel items)
  NOVELTY_PREFERENCE: 0.6,

  // Maximum number of interactions to use for user modeling
  MAX_INTERACTIONS_FOR_MODEL: 500,
};

/**
 * Service responsible for personalizing recommendations based on user preferences and behaviors
 */
class PersonalizationService {
  /**
   * Generate a comprehensive user model that captures preferences, behaviors, and context
   * @param userId The ID of the user to model
   * @returns A user model object with taste preferences and contextual information
   */
  async generateUserModel(userId: string): Promise<any> {
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Get user profile with explicit preferences
      const user = await User.findById(userObjectId).lean();
      if (!user) {
        throw new Error(`User not found with id: ${userId}`);
      }

      // Get user interactions to model implicit preferences
      const interactions = await this.getUserInteractions(userObjectId);

      // Create the user model with different components
      const userModel = {
        // User identity and basic info
        userId: userObjectId,

        // Explicit preferences from user profile
        explicitPreferences: {
          roastLevels: user.preferences?.roastLevel || [],
          flavorProfiles: user.preferences?.flavorProfile || [],
          brewMethods: user.preferences?.brewMethods || [],
        },

        // Implicit preferences derived from behavior
        implicitPreferences: await this.deriveImplicitPreferences(interactions),

        // Contextual patterns
        contextualPatterns: await this.deriveContextualPatterns(userObjectId),

        // Novelty preference (balance between familiar and new)
        noveltyPreference: await this.calculateNoveltyPreference(userObjectId),

        // Most active time periods
        activeTimePatterns: await this.deriveActiveTimePatterns(interactions),

        // Last model update timestamp
        lastUpdated: new Date(),
      };

      logger.info(`Generated user model for user: ${userId}`);
      return userModel;
    } catch (error) {
      logger.error(`Error generating user model: ${error}`);
      throw error;
    }
  }

  /**
   * Get recent user interactions for modeling
   * @private
   */
  private async getUserInteractions(userId: mongoose.Types.ObjectId): Promise<IUserInteraction[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PERSONALIZATION_CONFIG.RECENCY_PERIODS.OLD);

    return await UserInteraction.find({
      userId,
      timestamp: { $gte: cutoffDate },
    })
      .sort({ timestamp: -1 })
      .limit(PERSONALIZATION_CONFIG.MAX_INTERACTIONS_FOR_MODEL)
      .lean();
  }

  /**
   * Derive implicit preferences from user interactions
   * @private
   */
  private async deriveImplicitPreferences(interactions: IUserInteraction[]): Promise<any> {
    // Group interactions by coffee attributes to identify patterns
    const coffeeIds = [...new Set(interactions.map((i) => i.coffeeId.toString()))];

    // This would involve querying coffee details for all interacted coffees
    // and then analyzing patterns in those interactions

    // For this implementation, we'll return a simplified model
    return {
      // Preferred coffee attributes based on interaction frequency and recency
      preferredAttributes: await this.extractPreferredAttributes(interactions),

      // Interaction patterns by type
      interactionPatterns: this.analyzeInteractionPatterns(interactions),

      // Negative preferences (items that were dismissed or poorly rated)
      negativePreferences: await this.extractNegativePreferences(interactions),
    };
  }

  /**
   * Extract preferred attributes from user interactions
   * @private
   */
  private async extractPreferredAttributes(interactions: IUserInteraction[]): Promise<any> {
    // This would involve querying coffee details and aggregating attributes
    // based on interaction frequency and recency

    // For this implementation, we'll return a placeholder object
    // In a full implementation, you would query Coffee collection to get details
    return {
      origins: [], // Weighted list of preferred origins
      roastLevels: [], // Weighted list of preferred roast levels
      processingMethods: [], // Weighted list of preferred processing methods
      flavorNotes: [], // Weighted list of preferred flavor notes
    };
  }

  /**
   * Analyze user interaction patterns by type and recency
   * @private
   */
  private analyzeInteractionPatterns(interactions: IUserInteraction[]): any {
    const patterns: any = {};
    const interactionTypes = [
      'view',
      'click',
      'search',
      'favorite',
      'purchase',
      'rating',
      'share',
      'review',
    ];

    // Initialize patterns for each interaction type
    interactionTypes.forEach((type) => {
      patterns[type] = {
        count: 0,
        recentCount: 0,
        frequency: 0,
        lastInteraction: null,
      };
    });

    // Calculate the cutoff date for recent interactions (7 days)
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - PERSONALIZATION_CONFIG.RECENCY_PERIODS.RECENT);

    // Count interactions by type
    interactions.forEach((interaction) => {
      const type = interaction.interactionType;
      patterns[type].count += 1;

      if (interaction.timestamp >= recentCutoff) {
        patterns[type].recentCount += 1;
      }

      if (
        !patterns[type].lastInteraction ||
        interaction.timestamp > patterns[type].lastInteraction
      ) {
        patterns[type].lastInteraction = interaction.timestamp;
      }
    });

    // Calculate frequency for each type (as percentage of total interactions)
    const totalInteractions = interactions.length;
    interactionTypes.forEach((type) => {
      patterns[type].frequency =
        totalInteractions > 0 ? patterns[type].count / totalInteractions : 0;
    });

    return patterns;
  }

  /**
   * Extract negative preferences from dismissals and low ratings
   * @private
   */
  private async extractNegativePreferences(interactions: IUserInteraction[]): Promise<any> {
    // Find dismissed recommendations and low-rated items
    // This would involve cross-referencing with recommendation feedback

    // For this implementation, we'll return a placeholder
    return {
      dismissedCoffeeIds: [],
      lowRatedAttributes: {},
    };
  }

  /**
   * Derive contextual patterns from user behavior
   * @private
   */
  private async deriveContextualPatterns(userId: mongoose.Types.ObjectId): Promise<any> {
    // Analyze temporal patterns (time of day, day of week)
    const temporalPatterns = await this.analyzeTemporalPatterns(userId);

    // Analyze device usage patterns
    const devicePatterns = await this.analyzeDevicePatterns(userId);

    // Analyze location-based patterns
    const locationPatterns = await this.analyzeLocationPatterns(userId);

    return {
      temporal: temporalPatterns,
      device: devicePatterns,
      location: locationPatterns,
    };
  }

  /**
   * Analyze when users are most active
   * @private
   */
  private async analyzeTemporalPatterns(userId: mongoose.Types.ObjectId): Promise<any> {
    // Aggregate interactions by hour and day of week
    const hourlyAggregation = await UserInteraction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const dailyAggregation = await UserInteraction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { $dayOfWeek: '$timestamp' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Transform to more usable format
    const hourlyPatterns = hourlyAggregation.reduce((acc: any, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const dailyPatterns = dailyAggregation.reduce((acc: any, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    return {
      hourly: hourlyPatterns,
      daily: dailyPatterns,
      peakHour: hourlyAggregation.length > 0 ? hourlyAggregation[0]._id : null,
      peakDay: dailyAggregation.length > 0 ? dailyAggregation[0]._id : null,
    };
  }

  /**
   * Analyze user device patterns
   * @private
   */
  private async analyzeDevicePatterns(userId: mongoose.Types.ObjectId): Promise<any> {
    // Aggregate interactions by device type
    const deviceAggregation = await UserInteraction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$metadata.deviceType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Calculate preferred device type
    const preferredDevice = deviceAggregation.length > 0 ? deviceAggregation[0]._id : 'unknown';

    // Transform to more usable format
    const deviceDistribution = deviceAggregation.reduce((acc: any, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    return {
      preferredDevice,
      deviceDistribution,
    };
  }

  /**
   * Analyze location-based patterns
   * @private
   */
  private async analyzeLocationPatterns(userId: mongoose.Types.ObjectId): Promise<any> {
    // Aggregate interactions by location
    const locationAggregation = await UserInteraction.aggregate([
      { $match: { userId, 'metadata.location': { $exists: true } } },
      {
        $group: {
          _id: '$metadata.location',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Calculate most common location
    const commonLocation = locationAggregation.length > 0 ? locationAggregation[0]._id : null;

    return {
      commonLocation,
      locationDistribution: locationAggregation.reduce((acc: any, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
    };
  }

  /**
   * Calculate user's preference for novelty vs. familiarity
   * @private
   */
  private async calculateNoveltyPreference(userId: mongoose.Types.ObjectId): Promise<number> {
    // This would involve analyzing how often users try new items vs. returning to favorites
    // For now, return a default value based on the config
    return PERSONALIZATION_CONFIG.NOVELTY_PREFERENCE;
  }

  /**
   * Derive patterns of when the user is most active
   * @private
   */
  private async deriveActiveTimePatterns(interactions: IUserInteraction[]): Promise<any> {
    // Group interactions by time of day and day of week
    const timeOfDayGroups: { [key: string]: number } = {
      morning: 0, // 5-11 AM
      afternoon: 0, // 12-5 PM
      evening: 0, // 6-9 PM
      night: 0, // 10 PM - 4 AM
    };

    const dayOfWeekGroups: { [key: string]: number } = {
      weekday: 0,
      weekend: 0,
    };

    interactions.forEach((interaction) => {
      const hour = new Date(interaction.timestamp).getHours();
      const day = new Date(interaction.timestamp).getDay(); // 0 = Sunday, 6 = Saturday

      // Categorize by time of day
      if (hour >= 5 && hour < 12) {
        timeOfDayGroups.morning += 1;
      } else if (hour >= 12 && hour < 18) {
        timeOfDayGroups.afternoon += 1;
      } else if (hour >= 18 && hour < 22) {
        timeOfDayGroups.evening += 1;
      } else {
        timeOfDayGroups.night += 1;
      }

      // Categorize by weekday/weekend
      if (day === 0 || day === 6) {
        dayOfWeekGroups.weekend += 1;
      } else {
        dayOfWeekGroups.weekday += 1;
      }
    });

    // Find most active period
    let mostActiveTimeOfDay = Object.keys(timeOfDayGroups)[0];
    let mostActiveDayType = Object.keys(dayOfWeekGroups)[0];

    Object.keys(timeOfDayGroups).forEach((key) => {
      if (timeOfDayGroups[key] > timeOfDayGroups[mostActiveTimeOfDay]) {
        mostActiveTimeOfDay = key;
      }
    });

    Object.keys(dayOfWeekGroups).forEach((key) => {
      if (dayOfWeekGroups[key] > dayOfWeekGroups[mostActiveDayType]) {
        mostActiveDayType = key;
      }
    });

    return {
      mostActiveTimeOfDay,
      mostActiveDayType,
      timeOfDayDistribution: timeOfDayGroups,
      dayTypeDistribution: dayOfWeekGroups,
    };
  }

  /**
   * Apply personalization to a set of recommendations based on user model
   * @param recommendations The base recommendations to personalize
   * @param userModel The user model to use for personalization
   * @param context Optional context information (device, time, location)
   * @returns Personalized recommendations
   */
  async personalizeRecommendations(
    recommendations: any[],
    userModel: any,
    context?: {
      deviceType?: string;
      timeOfDay?: string;
      dayOfWeek?: number;
      location?: string;
    }
  ): Promise<any[]> {
    if (!recommendations.length) {
      return [];
    }

    // Create a copy of recommendations to avoid modifying the original
    const personalizedRecs = [...recommendations];

    // Apply contextual boost based on current context if provided
    if (context) {
      this.applyContextualBoosting(personalizedRecs, userModel, context);
    }

    // Apply diversity to ensure varied recommendations
    this.applyDiversityRules(personalizedRecs, userModel);

    // Apply personalized ranking based on user model
    this.applyPersonalizedRanking(personalizedRecs, userModel);

    // Add personalized explanations
    this.addPersonalizedExplanations(personalizedRecs, userModel);

    return personalizedRecs;
  }

  /**
   * Apply contextual boosting based on current context
   * @private
   */
  private applyContextualBoosting(recommendations: any[], userModel: any, context: any): void {
    // Apply boosts based on time of day
    if (context.timeOfDay && userModel.contextualPatterns?.temporal?.hourly) {
      // Map timeOfDay to hour ranges
      const hourRanges: { [key: string]: number[] } = {
        morning: [5, 6, 7, 8, 9, 10, 11],
        afternoon: [12, 13, 14, 15, 16, 17],
        evening: [18, 19, 20, 21],
        night: [22, 23, 0, 1, 2, 3, 4],
      };

      const currentHours = hourRanges[context.timeOfDay] || [];
      const temporalPatterns = userModel.contextualPatterns.temporal;

      // If the user is active during the current time period, boost matching items
      if (currentHours.some((hour) => temporalPatterns.hourly[hour])) {
        recommendations.forEach((rec) => {
          rec.score *= 1 + PERSONALIZATION_CONFIG.CONTEXT_WEIGHTS.time_of_day * 0.2;
        });
      }
    }

    // Apply boosts based on day of week
    if (context.dayOfWeek !== undefined && userModel.contextualPatterns?.temporal?.daily) {
      const isWeekend = context.dayOfWeek === 0 || context.dayOfWeek === 6;
      const activePattern = userModel.activeTimePatterns?.mostActiveDayType;

      if (
        (isWeekend && activePattern === 'weekend') ||
        (!isWeekend && activePattern === 'weekday')
      ) {
        recommendations.forEach((rec) => {
          rec.score *= 1 + PERSONALIZATION_CONFIG.CONTEXT_WEIGHTS.day_of_week * 0.2;
        });
      }
    }

    // Apply boosts based on device type
    if (context.deviceType && userModel.contextualPatterns?.device?.preferredDevice) {
      if (context.deviceType === userModel.contextualPatterns.device.preferredDevice) {
        recommendations.forEach((rec) => {
          rec.score *= 1 + PERSONALIZATION_CONFIG.CONTEXT_WEIGHTS.device * 0.2;
        });
      }
    }

    // Apply boosts based on location
    if (context.location && userModel.contextualPatterns?.location?.commonLocation) {
      if (context.location === userModel.contextualPatterns.location.commonLocation) {
        recommendations.forEach((rec) => {
          rec.score *= 1 + PERSONALIZATION_CONFIG.CONTEXT_WEIGHTS.location * 0.2;
        });
      }
    }

    // Normalize scores after all boosts
    const maxScore = Math.max(...recommendations.map((rec) => rec.score));
    if (maxScore > 1) {
      recommendations.forEach((rec) => {
        rec.score = rec.score / maxScore;
      });
    }
  }

  /**
   * Apply diversity rules to ensure varied recommendations
   * @private
   */
  private applyDiversityRules(recommendations: any[], userModel: any): void {
    // Group by origins and roast levels to ensure diversity
    const originCounts: { [key: string]: number } = {};
    const roastCounts: { [key: string]: number } = {};

    // Apply penalties for over-represented categories
    recommendations.forEach((rec) => {
      // We'd normally fetch these from the coffee details
      const origin = rec.origin || 'unknown';
      const roastLevel = rec.roastLevel || 'unknown';

      originCounts[origin] = (originCounts[origin] || 0) + 1;
      roastCounts[roastLevel] = (roastCounts[roastLevel] || 0) + 1;

      // Apply diversity penalties
      if (originCounts[origin] > 3) {
        rec.score *= 0.9; // Penalize origin that appears too frequently
      }

      if (roastCounts[roastLevel] > 5) {
        rec.score *= 0.9; // Penalize roast level that appears too frequently
      }
    });

    // Balance novelty vs. familiarity based on user preference
    const noveltyPreference =
      userModel.noveltyPreference || PERSONALIZATION_CONFIG.NOVELTY_PREFERENCE;

    // If the user prefers novelty, boost less common items
    if (noveltyPreference > 0.5) {
      // Identify less common origins and roast levels
      const lessCommonOrigins = Object.keys(originCounts).filter((o) => originCounts[o] === 1);
      const lessCommonRoasts = Object.keys(roastCounts).filter((r) => roastCounts[r] === 1);

      recommendations.forEach((rec) => {
        if (lessCommonOrigins.includes(rec.origin)) {
          rec.score *= 1 + (noveltyPreference - 0.5) * 0.4;
        }

        if (lessCommonRoasts.includes(rec.roastLevel)) {
          rec.score *= 1 + (noveltyPreference - 0.5) * 0.3;
        }
      });
    }
  }

  /**
   * Apply personalized ranking based on user model
   * @private
   */
  private applyPersonalizedRanking(recommendations: any[], userModel: any): void {
    // Apply preference boosts based on user model
    recommendations.forEach((rec) => {
      // Boost items that match explicit preferences
      if (userModel.explicitPreferences.roastLevels.includes(rec.roastLevel)) {
        rec.score *= 1 + PERSONALIZATION_CONFIG.FEATURE_IMPORTANCE.explicit_preferences * 0.2;
      }

      // Boost items that match implicit preferences
      // This would require more data about the items, but the concept is illustrated here

      // For example, if we had coffee details:
      // if (userModel.implicitPreferences.preferredAttributes.origins.includes(rec.origin)) {
      //   rec.score *= (1 + PERSONALIZATION_CONFIG.FEATURE_IMPORTANCE.implicit_behaviors * 0.2);
      // }
    });

    // Sort by updated scores
    recommendations.sort((a, b) => b.score - a.score);

    // Update matchPercentage based on new scores
    recommendations.forEach((rec) => {
      rec.matchPercentage = Math.round(rec.score * 100);
    });
  }

  /**
   * Add personalized explanations to recommendations
   * @private
   */
  private addPersonalizedExplanations(recommendations: any[], userModel: any): void {
    recommendations.forEach((rec) => {
      const reasons: string[] = [];

      // Add explanation based on explicit preferences
      if (userModel.explicitPreferences.roastLevels.includes(rec.roastLevel)) {
        reasons.push(`Matches your preferred ${rec.roastLevel} roast level`);
      }

      if (
        userModel.explicitPreferences.flavorProfiles.some(
          (flavor: string) => rec.flavorNotes && rec.flavorNotes.includes(flavor)
        )
      ) {
        reasons.push(`Contains flavor notes you enjoy`);
      }

      // Add explanation based on implicit preferences
      // Example placeholder - would need actual coffee details

      // Add explanation based on social signals
      // "Popular among coffee lovers with similar taste"

      // Add explanation based on novelty if that's preferred
      if (userModel.noveltyPreference > 0.6 && rec.popularity && rec.popularity < 0.3) {
        reasons.push(`A hidden gem you might not have discovered otherwise`);
      }

      // Make sure we have at least one reason
      if (reasons.length === 0) {
        reasons.push(`Matches your taste profile`);
      }

      rec.reasons = reasons;
    });
  }
}

export default new PersonalizationService();
