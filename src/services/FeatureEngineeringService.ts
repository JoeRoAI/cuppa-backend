/**
 * FeatureEngineeringService.ts
 * Service for automated feature extraction and engineering for the recommendation system
 */

import mongoose from 'mongoose';
import { UserInteraction, IUserInteraction } from '../models/recommendation.model';
import User from '../models/user.model';
import Coffee from '../models/coffee.model';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

// Feature interfaces
interface UserFeatures {
  userId: mongoose.Types.ObjectId;
  features: {
    // Behavioral features
    totalInteractions: number;
    interactionFrequency: number; // interactions per day
    averageSessionLength: number;
    preferredTimeOfDay: string[];
    preferredDayOfWeek: number[];

    // Preference features
    preferredRoastLevels: Array<{ roastLevel: string; score: number }>;
    preferredOrigins: Array<{ origin: string; score: number }>;
    preferredProcessingMethods: Array<{ method: string; score: number }>;
    preferredFlavorNotes: Array<{ note: string; score: number }>;

    // Engagement features
    averageRating: number;
    ratingVariance: number;
    purchaseRate: number;
    favoriteRate: number;

    // Temporal features
    seasonalPreferences: Record<string, number>; // season -> preference score
    trendingInterests: Array<{ feature: string; trend: 'increasing' | 'decreasing' | 'stable' }>;

    // Diversity features
    diversityScore: number; // how diverse their preferences are
    explorationRate: number; // rate of trying new things

    // Social features
    socialInfluence: number; // how much they follow others
    influenceScore: number; // how much they influence others
  };
  lastUpdated: Date;
  version: number;
}

interface CoffeeFeatures {
  coffeeId: mongoose.Types.ObjectId;
  features: {
    // Popularity features
    totalViews: number;
    totalPurchases: number;
    totalRatings: number;
    averageRating: number;
    ratingCount: number;

    // Engagement features
    viewToPurchaseRate: number;
    favoriteRate: number;
    shareRate: number;

    // Temporal features
    popularityTrend: 'increasing' | 'decreasing' | 'stable';
    seasonalPopularity: Record<string, number>;
    peakHours: number[];

    // Content features
    roastLevel: string;
    origin: string;
    processingMethod: string;
    flavorNotes: string[];
    priceRange: string;

    // Similarity features
    similarCoffees: Array<{ coffeeId: mongoose.Types.ObjectId; similarity: number }>;

    // Quality features
    qualityScore: number; // derived from ratings and reviews
    consistencyScore: number; // rating variance
  };
  lastUpdated: Date;
  version: number;
}

interface InteractionFeatures {
  userId: mongoose.Types.ObjectId;
  coffeeId: mongoose.Types.ObjectId;
  features: {
    // Context features
    timeOfDay: string;
    dayOfWeek: number;
    season: string;
    deviceType: string;

    // Sequence features
    sessionPosition: number; // position in session
    previousInteractions: string[]; // last N interaction types
    timeSinceLastInteraction: number; // minutes

    // User state features
    userMood: string; // derived from recent interactions
    explorationMode: boolean; // whether user is exploring

    // Item state features
    itemPopularityAtTime: number;
    itemTrendingScore: number;
  };
  timestamp: Date;
}

class FeatureEngineeringService extends EventEmitter {
  private readonly FEATURE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private readonly BATCH_SIZE = 1000;
  private featureCache = new Map<string, { data: any; timestamp: Date }>();

  constructor() {
    super();
    this.setupPeriodicTasks();
  }

  /**
   * Extract and compute user features
   * @param userId User ID
   * @param forceRefresh Force refresh of cached features
   * @returns User features
   */
  async extractUserFeatures(
    userId: mongoose.Types.ObjectId,
    forceRefresh = false
  ): Promise<UserFeatures> {
    const cacheKey = `user_features_${userId}`;

    // Check cache first
    if (!forceRefresh && this.featureCache.has(cacheKey)) {
      const cached = this.featureCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp.getTime() < this.FEATURE_CACHE_TTL) {
        return cached.data;
      }
    }

    logger.info(`Extracting features for user: ${userId}`);

    // Get user interactions
    const interactions = await UserInteraction.find({ userId })
      .sort({ timestamp: -1 })
      .limit(10000) // Limit to recent interactions for performance
      .lean();

    if (interactions.length === 0) {
      // Return default features for new users
      return this.getDefaultUserFeatures(userId);
    }

    // Extract behavioral features
    const behavioralFeatures = this.extractBehavioralFeatures(interactions);

    // Extract preference features
    const preferenceFeatures = await this.extractPreferenceFeatures(userId, interactions);

    // Extract engagement features
    const engagementFeatures = this.extractEngagementFeatures(interactions);

    // Extract temporal features
    const temporalFeatures = this.extractTemporalFeatures(interactions);

    // Extract diversity features
    const diversityFeatures = this.extractDiversityFeatures(interactions);

    // Extract social features
    const socialFeatures = await this.extractSocialFeatures(userId);

    const userFeatures: UserFeatures = {
      userId,
      features: {
        // Behavioral features
        totalInteractions: behavioralFeatures.totalInteractions || 0,
        interactionFrequency: behavioralFeatures.interactionFrequency || 0,
        averageSessionLength: behavioralFeatures.averageSessionLength || 0,
        preferredTimeOfDay: behavioralFeatures.preferredTimeOfDay || [],
        preferredDayOfWeek: behavioralFeatures.preferredDayOfWeek || [],

        // Preference features
        preferredRoastLevels: preferenceFeatures.preferredRoastLevels || [],
        preferredOrigins: preferenceFeatures.preferredOrigins || [],
        preferredProcessingMethods: preferenceFeatures.preferredProcessingMethods || [],
        preferredFlavorNotes: preferenceFeatures.preferredFlavorNotes || [],

        // Engagement features
        averageRating: engagementFeatures.averageRating || 0,
        ratingVariance: engagementFeatures.ratingVariance || 0,
        purchaseRate: engagementFeatures.purchaseRate || 0,
        favoriteRate: engagementFeatures.favoriteRate || 0,

        // Temporal features
        seasonalPreferences: temporalFeatures.seasonalPreferences || {
          spring: 0.25,
          summer: 0.25,
          fall: 0.25,
          winter: 0.25,
        },
        trendingInterests: temporalFeatures.trendingInterests || [],

        // Diversity features
        diversityScore: diversityFeatures.diversityScore || 0,
        explorationRate: diversityFeatures.explorationRate || 0,

        // Social features
        socialInfluence: socialFeatures.socialInfluence || 0.5,
        influenceScore: socialFeatures.influenceScore || 0.5,
      },
      lastUpdated: new Date(),
      version: 1,
    };

    // Cache the features
    this.featureCache.set(cacheKey, {
      data: userFeatures,
      timestamp: new Date(),
    });

    this.emit('userFeaturesExtracted', {
      userId,
      featureCount: Object.keys(userFeatures.features).length,
    });

    return userFeatures;
  }

  /**
   * Extract behavioral features from interactions
   * @private
   */
  private extractBehavioralFeatures(interactions: any[]): Partial<UserFeatures['features']> {
    const now = new Date();
    const daysSinceFirst = Math.max(
      1,
      (now.getTime() - new Date(interactions[interactions.length - 1].timestamp).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    // Group interactions by session (within 30 minutes)
    const sessions = this.groupInteractionsBySessions(interactions);
    const avgSessionLength =
      sessions.reduce((sum, session) => sum + session.length, 0) / sessions.length;

    // Time preferences
    const timeOfDayCount: Record<string, number> = {};
    const dayOfWeekCount: Record<number, number> = {};

    interactions.forEach((interaction) => {
      const timeOfDay =
        interaction.metadata?.timeOfDay || this.getTimeOfDay(new Date(interaction.timestamp));
      const dayOfWeek = interaction.metadata?.dayOfWeek || new Date(interaction.timestamp).getDay();

      timeOfDayCount[timeOfDay] = (timeOfDayCount[timeOfDay] || 0) + 1;
      dayOfWeekCount[dayOfWeek] = (dayOfWeekCount[dayOfWeek] || 0) + 1;
    });

    const preferredTimeOfDay = Object.entries(timeOfDayCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([time]) => time);

    const preferredDayOfWeek = Object.entries(dayOfWeekCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([day]) => parseInt(day));

    return {
      totalInteractions: interactions.length,
      interactionFrequency: interactions.length / daysSinceFirst,
      averageSessionLength: avgSessionLength,
      preferredTimeOfDay,
      preferredDayOfWeek,
    };
  }

  /**
   * Extract preference features
   * @private
   */
  private async extractPreferenceFeatures(
    userId: mongoose.Types.ObjectId,
    interactions: any[]
  ): Promise<Partial<UserFeatures['features']>> {
    // Get coffee details for interactions
    const coffeeIds = [...new Set(interactions.map((i) => i.coffeeId))];
    const coffees = await Coffee.find({ _id: { $in: coffeeIds } }).lean();
    const coffeeMap = new Map(coffees.map((c) => [c._id.toString(), c]));

    // Weight interactions by type and recency
    const weightedPreferences: Record<string, Record<string, number>> = {
      roastLevels: {},
      origins: {},
      processingMethods: {},
      flavorNotes: {},
    };

    interactions.forEach((interaction, index) => {
      const coffee = coffeeMap.get(interaction.coffeeId.toString());
      if (!coffee) return;

      const weight =
        this.getInteractionWeight(interaction) * this.getRecencyWeight(index, interactions.length);

      // Roast levels
      if (coffee.roastLevel) {
        weightedPreferences.roastLevels[coffee.roastLevel] =
          (weightedPreferences.roastLevels[coffee.roastLevel] || 0) + weight;
      }

      // Origins - use country from origin object
      if (coffee.origin && coffee.origin.country) {
        const originKey = coffee.origin.country;
        weightedPreferences.origins[originKey] =
          (weightedPreferences.origins[originKey] || 0) + weight;
      }

      // Processing methods - use method from processingDetails
      if (coffee.processingDetails && coffee.processingDetails.method) {
        const methodKey = coffee.processingDetails.method;
        weightedPreferences.processingMethods[methodKey] =
          (weightedPreferences.processingMethods[methodKey] || 0) + weight;
      }

      // Flavor notes - use flavorNotes from flavorProfile
      if (
        coffee.flavorProfile &&
        coffee.flavorProfile.flavorNotes &&
        Array.isArray(coffee.flavorProfile.flavorNotes)
      ) {
        coffee.flavorProfile.flavorNotes.forEach((note: string) => {
          weightedPreferences.flavorNotes[note] =
            (weightedPreferences.flavorNotes[note] || 0) + weight;
        });
      }
    });

    // Convert to sorted arrays
    const preferredRoastLevels = Object.entries(weightedPreferences.roastLevels)
      .map(([roastLevel, score]) => ({ roastLevel, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const preferredOrigins = Object.entries(weightedPreferences.origins)
      .map(([origin, score]) => ({ origin, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const preferredProcessingMethods = Object.entries(weightedPreferences.processingMethods)
      .map(([method, score]) => ({ method, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const preferredFlavorNotes = Object.entries(weightedPreferences.flavorNotes)
      .map(([note, score]) => ({ note, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    return {
      preferredRoastLevels,
      preferredOrigins,
      preferredProcessingMethods,
      preferredFlavorNotes,
    };
  }

  /**
   * Extract engagement features
   * @private
   */
  private extractEngagementFeatures(interactions: any[]): Partial<UserFeatures['features']> {
    const ratings = interactions.filter((i) => i.interactionType === 'rating' && i.value);
    const purchases = interactions.filter((i) => i.interactionType === 'purchase');
    const favorites = interactions.filter((i) => i.interactionType === 'favorite');
    const views = interactions.filter((i) => i.interactionType === 'view');

    const averageRating =
      ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length : 0;

    const ratingVariance =
      ratings.length > 1
        ? ratings.reduce((sum, r) => sum + Math.pow(r.value - averageRating, 2), 0) /
          (ratings.length - 1)
        : 0;

    const purchaseRate = views.length > 0 ? purchases.length / views.length : 0;
    const favoriteRate = views.length > 0 ? favorites.length / views.length : 0;

    return {
      averageRating,
      ratingVariance,
      purchaseRate,
      favoriteRate,
    };
  }

  /**
   * Extract temporal features
   * @private
   */
  private extractTemporalFeatures(interactions: any[]): Partial<UserFeatures['features']> {
    // Seasonal preferences
    const seasonalCount: Record<string, number> = { spring: 0, summer: 0, fall: 0, winter: 0 };

    interactions.forEach((interaction) => {
      const season = this.getSeason(new Date(interaction.timestamp));
      seasonalCount[season]++;
    });

    const totalInteractions = interactions.length;
    const seasonalPreferences: Record<string, number> = {};
    Object.entries(seasonalCount).forEach(([season, count]) => {
      seasonalPreferences[season] = count / totalInteractions;
    });

    // Trending interests (simplified - would need more sophisticated analysis)
    const trendingInterests = [{ feature: 'exploration', trend: 'stable' as const }];

    return {
      seasonalPreferences,
      trendingInterests,
    };
  }

  /**
   * Extract diversity features
   * @private
   */
  private extractDiversityFeatures(interactions: any[]): Partial<UserFeatures['features']> {
    const uniqueCoffees = new Set(interactions.map((i) => i.coffeeId.toString()));
    const diversityScore = uniqueCoffees.size / interactions.length;

    // Calculate exploration rate (new coffees in recent interactions)
    const recentInteractions = interactions.slice(0, Math.min(100, interactions.length));
    const recentUniqueCoffees = new Set(recentInteractions.map((i) => i.coffeeId.toString()));
    const explorationRate = recentUniqueCoffees.size / recentInteractions.length;

    return {
      diversityScore,
      explorationRate,
    };
  }

  /**
   * Extract social features
   * @private
   */
  private async extractSocialFeatures(
    userId: mongoose.Types.ObjectId
  ): Promise<Partial<UserFeatures['features']>> {
    // Simplified social features - would need social connection data
    return {
      socialInfluence: 0.5,
      influenceScore: 0.5,
    };
  }

  /**
   * Get default features for new users
   * @private
   */
  private getDefaultUserFeatures(userId: mongoose.Types.ObjectId): UserFeatures {
    return {
      userId,
      features: {
        totalInteractions: 0,
        interactionFrequency: 0,
        averageSessionLength: 0,
        preferredTimeOfDay: [],
        preferredDayOfWeek: [],
        preferredRoastLevels: [],
        preferredOrigins: [],
        preferredProcessingMethods: [],
        preferredFlavorNotes: [],
        averageRating: 0,
        ratingVariance: 0,
        purchaseRate: 0,
        favoriteRate: 0,
        seasonalPreferences: { spring: 0.25, summer: 0.25, fall: 0.25, winter: 0.25 },
        trendingInterests: [],
        diversityScore: 0,
        explorationRate: 0,
        socialInfluence: 0.5,
        influenceScore: 0.5,
      },
      lastUpdated: new Date(),
      version: 1,
    };
  }

  /**
   * Group interactions by sessions
   * @private
   */
  private groupInteractionsBySessions(interactions: any[]): any[][] {
    const sessions: any[][] = [];
    let currentSession: any[] = [];
    const sessionTimeout = 30 * 60 * 1000; // 30 minutes

    interactions.forEach((interaction, index) => {
      if (index === 0) {
        currentSession = [interaction];
      } else {
        const timeDiff =
          new Date(interactions[index - 1].timestamp).getTime() -
          new Date(interaction.timestamp).getTime();
        if (timeDiff > sessionTimeout) {
          sessions.push(currentSession);
          currentSession = [interaction];
        } else {
          currentSession.push(interaction);
        }
      }
    });

    if (currentSession.length > 0) {
      sessions.push(currentSession);
    }

    return sessions;
  }

  /**
   * Get interaction weight based on type
   * @private
   */
  private getInteractionWeight(interaction: any): number {
    const weights: Record<string, number> = {
      purchase: 1.0,
      rating: 0.9,
      favorite: 0.8,
      share: 0.7,
      review: 0.6,
      click: 0.4,
      view: 0.3,
      search: 0.2,
    };
    return weights[interaction.interactionType] || 0.1;
  }

  /**
   * Get recency weight (more recent = higher weight)
   * @private
   */
  private getRecencyWeight(index: number, total: number): number {
    return Math.exp(-index / (total * 0.3)); // Exponential decay
  }

  /**
   * Get time of day from timestamp
   * @private
   */
  private getTimeOfDay(timestamp: Date): string {
    const hour = timestamp.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Get season from timestamp
   * @private
   */
  private getSeason(timestamp: Date): string {
    const month = timestamp.getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  /**
   * Setup periodic feature refresh tasks
   * @private
   */
  private setupPeriodicTasks(): void {
    // Clear cache every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.featureCache.entries()) {
        if (now - value.timestamp.getTime() > this.FEATURE_CACHE_TTL) {
          this.featureCache.delete(key);
        }
      }
    }, this.FEATURE_CACHE_TTL);

    logger.info('Feature engineering service initialized with periodic tasks');
  }

  /**
   * Batch extract features for multiple users
   * @param userIds Array of user IDs
   * @returns Array of user features
   */
  async batchExtractUserFeatures(userIds: mongoose.Types.ObjectId[]): Promise<UserFeatures[]> {
    const results: UserFeatures[] = [];

    for (let i = 0; i < userIds.length; i += this.BATCH_SIZE) {
      const batch = userIds.slice(i, i + this.BATCH_SIZE);
      const batchPromises = batch.map((userId) => this.extractUserFeatures(userId));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      logger.info(
        `Processed feature extraction batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(userIds.length / this.BATCH_SIZE)}`
      );
    }

    return results;
  }

  /**
   * Get feature extraction statistics
   * @returns Statistics about feature extraction
   */
  getFeatureStats(): {
    cacheSize: number;
    cacheHitRate: number;
    lastExtractionTime: Date | null;
  } {
    return {
      cacheSize: this.featureCache.size,
      cacheHitRate: 0, // Would need to track hits/misses
      lastExtractionTime: new Date(), // Simplified
    };
  }
}

export default new FeatureEngineeringService();
