/**
 * RecommendationEngine.ts
 * Core recommendation engine implementing various recommendation algorithms
 */

import mongoose from 'mongoose';
import {
  UserInteraction,
  Recommendation,
  TasteSimilarity,
  ItemSimilarity,
  IRecommendation,
} from '../models/recommendation.model';
import User from '../models/user.model';
import PersonalizationService from './PersonalizationService';
import DiscoveryModeService from './DiscoveryModeService';
import logger from '../utils/logger';

// Internal recommendation type with additional properties for processing
interface InternalRecommendation {
  userId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  itemType: 'coffee' | 'roaster' | 'shop' | 'user';
  score: number;
  reason: string;
  algorithm?: string;
  coffee?: any;
  reasons?: string[];
  matchPercentage?: number;
  context?: {
    source?: string;
    position?: number;
    [key: string]: any;
  };
}

// Configuration for recommendation algorithms
const RECOMMENDATION_CONFIG = {
  // Number of similar users to consider for collaborative filtering
  MAX_SIMILAR_USERS: 10,

  // Number of similar items to consider for content-based filtering
  MAX_SIMILAR_ITEMS: 20,

  // Minimum similarity score to consider for collaborative filtering (range -1 to 1)
  MIN_USER_SIMILARITY: 0.1,

  // Minimum similarity score to consider for content-based filtering (range 0 to 1)
  MIN_ITEM_SIMILARITY: 0.2,

  // Weights for hybrid recommendations
  WEIGHTS: {
    COLLABORATIVE: 0.4,
    CONTENT_BASED: 0.3,
    POPULARITY: 0.2,
    DIVERSITY: 0.1,
  },

  // Maximum number of recommendations to generate per algorithm
  MAX_RECOMMENDATIONS: 50,

  // How long recommendations remain valid (in days)
  RECOMMENDATION_EXPIRY_DAYS: 7,

  // Diversity settings
  DIVERSITY: {
    MIN_DISTANCE: 0.3, // Minimum distance between recommended items
    MAX_FROM_SAME_ORIGIN: 3, // Maximum items from same origin
    MAX_FROM_SAME_ROAST_LEVEL: 5, // Maximum items from same roast level
  },
};

class RecommendationEngine {
  /**
   * Generate personalized recommendations for a user
   * @param userId The user ID
   * @param options Configuration options for recommendations
   * @returns An array of recommendation objects
   */
  async generateRecommendations(
    userId: string,
    options: {
      limit?: number;
      algorithm?:
        | 'collaborative'
        | 'content-based'
        | 'hybrid'
        | 'popularity'
        | 'discovery'
        | 'social';
      excludeCoffeeIds?: string[];
      includeReasons?: boolean;
      discoveryMode?: {
        algorithm?: 'epsilon-greedy' | 'ucb' | 'thompson-sampling' | 'hybrid';
        explorationRate?: number;
      };
      context?: {
        source?: string;
        deviceType?: string;
        timeOfDay?: string;
        dayOfWeek?: number;
        location?: string;
      };
    } = {}
  ): Promise<InternalRecommendation[]> {
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      let recommendations: InternalRecommendation[] = [];

      // Get recently viewed/rated/purchased coffees to exclude from recommendations
      // unless explicitly provided in options.excludeCoffeeIds
      const excludeIds = options.excludeCoffeeIds || [];
      if (!options.excludeCoffeeIds) {
        const recentInteractions = await UserInteraction.find({
          userId: userObjectId,
          interactionType: { $in: ['view', 'rating', 'purchase'] },
          timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        })
          .select('coffeeId')
          .lean();

        excludeIds.push(...recentInteractions.map((i) => i.coffeeId.toString()));
      }

      // Use the appropriate algorithm based on options or hybrid by default
      const algorithm = options.algorithm || 'hybrid';

      switch (algorithm) {
        case 'collaborative':
          recommendations = await this.getCollaborativeFilteringRecommendations(
            userObjectId,
            excludeIds
          );
          break;
        case 'content-based':
          recommendations = await this.getContentBasedRecommendations(userObjectId, excludeIds);
          break;
        case 'popularity':
          recommendations = await this.getPopularityBasedRecommendations(userObjectId, excludeIds);
          break;
        case 'discovery':
          recommendations = await this.getDiscoveryRecommendations(
            userObjectId,
            excludeIds,
            options.discoveryMode
          );
          break;
        case 'social':
          recommendations = await this.getSocialRecommendations(userObjectId, excludeIds);
          break;
        case 'hybrid':
        default:
          recommendations = await this.getHybridRecommendations(
            userObjectId,
            excludeIds,
            options.discoveryMode
          );
          break;
      }

      // Set additional metadata and limit results
      const limit = options.limit || 10;

      // Apply personalization to base recommendations using the user model
      try {
        // Generate user model for personalization
        const userModel = await PersonalizationService.generateUserModel(userId);

        // Apply personalization with context if provided
        recommendations = await PersonalizationService.personalizeRecommendations(
          recommendations,
          userModel,
          options.context
        );

        logger.info(`Successfully personalized recommendations for user: ${userId}`);
      } catch (error) {
        logger.error(`Error personalizing recommendations: ${error}`);
        // Continue with base recommendations if personalization fails
      }

      // Apply limit after personalization to ensure we get the most personalized options
      recommendations = recommendations.slice(0, limit);

      // Convert scores to percentages for UI display
      recommendations.forEach((rec) => {
        if (rec.score !== undefined) {
          rec.matchPercentage = Math.round(rec.score * 100);
        }
      });

      // Remove reasons if not requested
      if (!options.includeReasons) {
        recommendations.forEach((rec) => {
          rec.reasons = [];
        });
      }

      // Add context information if provided
      if (options.context && options.context.source) {
        const contextSource = options.context.source;
        recommendations.forEach((rec) => {
          if (!rec.context) {
            rec.context = {
              source: contextSource,
              position: 0,
            };
          } else {
            rec.context.source = contextSource;
          }
        });
      }

      // Save recommendations to database
      await Recommendation.insertMany(
        recommendations.map((rec, index) => ({
          userId: rec.userId,
          itemId: rec.itemId,
          itemType: rec.itemType,
          score: rec.score,
          reason: rec.reason,
          status: 'active',
          createdAt: new Date(),
          expiresAt: new Date(
            Date.now() + RECOMMENDATION_CONFIG.RECOMMENDATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
          ),
        }))
      );

      return recommendations;
    } catch (error) {
      logger.error('Error generating recommendations:', error);
      throw error;
    }
  }

  /**
   * Get recommendations using collaborative filtering
   * @private
   */
  private async getCollaborativeFilteringRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = []
  ): Promise<InternalRecommendation[]> {
    try {
      // Find similar users based on taste similarity
      const similarUsers = await TasteSimilarity.find({
        $or: [{ userId1: userId }, { userId2: userId }],
        similarityScore: { $gte: RECOMMENDATION_CONFIG.MIN_USER_SIMILARITY },
      })
        .sort({ similarityScore: -1 })
        .limit(RECOMMENDATION_CONFIG.MAX_SIMILAR_USERS)
        .lean();

      if (similarUsers.length === 0) {
        logger.info(`No similar users found for collaborative filtering: ${userId}`);
        return [];
      }

      // Extract similar user IDs
      const similarUserIds = similarUsers.map((sim) =>
        sim.userId1.equals(userId) ? sim.userId2 : sim.userId1
      );

      // Get highly-rated interactions from similar users
      const similarUserInteractions = await UserInteraction.find({
        userId: { $in: similarUserIds },
        interactionType: { $in: ['rating', 'purchase', 'favorite'] },
        coffeeId: { $nin: excludeCoffeeIds.map((id) => new mongoose.Types.ObjectId(id)) },
        value: { $gte: 4 }, // Only consider high ratings (4+ out of 5)
      })
        .populate('coffeeId')
        .lean();

      // Group interactions by coffee and calculate weighted scores
      const coffeeScores = new Map<string, { score: number; reasons: string[]; coffee: any }>();

      for (const interaction of similarUserInteractions) {
        const coffeeId = interaction.coffeeId._id.toString();
        const similarUser = similarUsers.find(
          (sim) => sim.userId1.equals(interaction.userId) || sim.userId2.equals(interaction.userId)
        );

        if (!similarUser || !interaction.coffeeId) continue;

        const similarityScore = similarUser.similarityScore;
        const interactionWeight = RECOMMENDATION_CONFIG.WEIGHTS.COLLABORATIVE;
        const ratingValue = interaction.value || 5; // Default to 5 if no explicit rating

        // Calculate weighted score
        const weightedScore = (ratingValue / 5) * similarityScore * interactionWeight;

        if (coffeeScores.has(coffeeId)) {
          const existing = coffeeScores.get(coffeeId)!;
          existing.score += weightedScore;
          existing.reasons.push(`Liked by similar coffee enthusiasts`);
        } else {
          coffeeScores.set(coffeeId, {
            score: weightedScore,
            reasons: [`Recommended based on users with similar taste`],
            coffee: interaction.coffeeId,
          });
        }
      }

      // Convert to recommendation format and sort by score
      const recommendations: InternalRecommendation[] = Array.from(coffeeScores.entries())
        .map(([coffeeId, data]) => ({
          userId,
          itemId: new mongoose.Types.ObjectId(coffeeId),
          itemType: 'coffee' as const,
          score: Math.min(data.score, 1), // Normalize to max 1
          reason: data.reasons.join('; '),
          algorithm: 'collaborative',
          coffee: data.coffee,
          reasons: data.reasons,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS);

      logger.info(
        `Generated ${recommendations.length} collaborative filtering recommendations for user: ${userId}`
      );
      return recommendations;
    } catch (error) {
      logger.error('Error in collaborative filtering recommendations:', error);
      return [];
    }
  }

  /**
   * Get recommendations using content-based filtering
   * @private
   */
  private async getContentBasedRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = []
  ): Promise<InternalRecommendation[]> {
    try {
      // Get user's interaction history to build preference profile
      const userInteractions = await UserInteraction.find({
        userId,
        interactionType: { $in: ['rating', 'purchase', 'favorite', 'view'] },
        value: { $gte: 3 }, // Only consider positive interactions
      })
        .populate('coffeeId')
        .sort({ timestamp: -1 })
        .limit(100) // Recent interactions
        .lean();

      if (userInteractions.length === 0) {
        logger.info(`No interaction history found for content-based filtering: ${userId}`);
        return [];
      }

      // Build user preference profile from interactions
      const preferenceProfile = this.buildUserPreferenceProfile(userInteractions);

      // Find similar coffees using ItemSimilarity or calculate similarity on-the-fly
      const candidateCoffees = await this.findSimilarCoffees(
        userInteractions.map((i) => i.coffeeId._id),
        excludeCoffeeIds
      );

      // Score candidates based on similarity to user preferences
      const recommendations: InternalRecommendation[] = [];

      for (const coffee of candidateCoffees) {
        const similarity = this.calculateCoffeeSimilarity(coffee, preferenceProfile);

        if (similarity > RECOMMENDATION_CONFIG.MIN_ITEM_SIMILARITY) {
          const reasons = this.generateContentBasedReasons(coffee, preferenceProfile);

          recommendations.push({
            userId,
            itemId: coffee._id,
            itemType: 'coffee' as const,
            score: similarity * RECOMMENDATION_CONFIG.WEIGHTS.CONTENT_BASED,
            reason: reasons.join('; '),
            algorithm: 'content-based',
            coffee,
            reasons,
          });
        }
      }

      // Sort by score and limit results
      const sortedRecommendations = recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS);

      logger.info(
        `Generated ${sortedRecommendations.length} content-based recommendations for user: ${userId}`
      );
      return sortedRecommendations;
    } catch (error) {
      logger.error('Error in content-based recommendations:', error);
      return [];
    }
  }

  /**
   * Build user preference profile from interaction history
   * @private
   */
  private buildUserPreferenceProfile(interactions: any[]): any {
    const profile = {
      roastLevels: new Map<string, number>(),
      origins: new Map<string, number>(),
      processingMethods: new Map<string, number>(),
      flavorNotes: new Map<string, number>(),
      totalWeight: 0,
    };

    for (const interaction of interactions) {
      const coffee = interaction.coffeeId;
      if (!coffee) continue;

      // Weight based on interaction type and recency
      const interactionWeight = this.getInteractionWeight(interaction);
      profile.totalWeight += interactionWeight;

      // Accumulate preferences
      if (coffee.roastLevel) {
        profile.roastLevels.set(
          coffee.roastLevel,
          (profile.roastLevels.get(coffee.roastLevel) || 0) + interactionWeight
        );
      }

      if (coffee.origin?.country) {
        profile.origins.set(
          coffee.origin.country,
          (profile.origins.get(coffee.origin.country) || 0) + interactionWeight
        );
      }

      if (coffee.processingDetails?.method) {
        profile.processingMethods.set(
          coffee.processingDetails.method,
          (profile.processingMethods.get(coffee.processingDetails.method) || 0) + interactionWeight
        );
      }

      if (coffee.flavorProfile?.flavorNotes) {
        for (const note of coffee.flavorProfile.flavorNotes) {
          profile.flavorNotes.set(note, (profile.flavorNotes.get(note) || 0) + interactionWeight);
        }
      }
    }

    return profile;
  }

  /**
   * Get weight for interaction based on type and recency
   * @private
   */
  private getInteractionWeight(interaction: any): number {
    const interactionWeights: { [key: string]: number } = {
      purchase: 1.0,
      rating: 0.9,
      favorite: 0.8,
      view: 0.3,
    };

    const baseWeight = interactionWeights[interaction.interactionType] || 0.5;

    // Apply recency decay
    const daysSince = (Date.now() - interaction.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.exp(-daysSince / 30); // Exponential decay over 30 days

    // Apply rating value if available
    const ratingWeight = interaction.value ? interaction.value / 5 : 1;

    return baseWeight * recencyWeight * ratingWeight;
  }

  /**
   * Find similar coffees using ItemSimilarity collection or database query
   * @private
   */
  private async findSimilarCoffees(
    likedCoffeeIds: mongoose.Types.ObjectId[],
    excludeIds: string[]
  ): Promise<any[]> {
    // First try to use pre-computed similarities
    const similarities = await ItemSimilarity.find({
      coffeeId1: { $in: likedCoffeeIds },
      similarityScore: { $gte: RECOMMENDATION_CONFIG.MIN_ITEM_SIMILARITY },
    })
      .populate('coffeeId2')
      .sort({ similarityScore: -1 })
      .limit(RECOMMENDATION_CONFIG.MAX_SIMILAR_ITEMS * 2)
      .lean();

    let similarCoffees: any[] = similarities
      .map((sim) => sim.coffeeId2)
      .filter((coffee) => coffee && !excludeIds.includes(coffee._id.toString()));

    // If we don't have enough pre-computed similarities, find candidates by attributes
    if (similarCoffees.length < 10) {
      const Coffee = mongoose.model('Coffee');
      const excludeObjectIds = excludeIds.map((id) => new mongoose.Types.ObjectId(id));
      const additionalCoffees = await Coffee.find({
        _id: { $nin: [...likedCoffeeIds, ...excludeObjectIds] },
        isActive: true,
        isAvailable: true,
      })
        .limit(50)
        .lean();

      similarCoffees = [...similarCoffees, ...additionalCoffees];
    }

    return similarCoffees.slice(0, RECOMMENDATION_CONFIG.MAX_SIMILAR_ITEMS);
  }

  /**
   * Calculate similarity between a coffee and user preference profile
   * @private
   */
  private calculateCoffeeSimilarity(coffee: any, profile: any): number {
    let totalSimilarity = 0;
    let weightSum = 0;

    // Roast level similarity
    if (coffee.roastLevel && profile.roastLevels.has(coffee.roastLevel)) {
      const weight = 0.3;
      const preference = profile.roastLevels.get(coffee.roastLevel) / profile.totalWeight;
      totalSimilarity += preference * weight;
      weightSum += weight;
    }

    // Origin similarity
    if (coffee.origin?.country && profile.origins.has(coffee.origin.country)) {
      const weight = 0.25;
      const preference = profile.origins.get(coffee.origin.country) / profile.totalWeight;
      totalSimilarity += preference * weight;
      weightSum += weight;
    }

    // Processing method similarity
    if (
      coffee.processingDetails?.method &&
      profile.processingMethods.has(coffee.processingDetails.method)
    ) {
      const weight = 0.2;
      const preference =
        profile.processingMethods.get(coffee.processingDetails.method) / profile.totalWeight;
      totalSimilarity += preference * weight;
      weightSum += weight;
    }

    // Flavor notes similarity
    if (coffee.flavorProfile?.flavorNotes) {
      const weight = 0.25;
      let flavorSimilarity = 0;
      let flavorCount = 0;

      for (const note of coffee.flavorProfile.flavorNotes) {
        if (profile.flavorNotes.has(note)) {
          flavorSimilarity += profile.flavorNotes.get(note) / profile.totalWeight;
          flavorCount++;
        }
      }

      if (flavorCount > 0) {
        totalSimilarity += (flavorSimilarity / flavorCount) * weight;
        weightSum += weight;
      }
    }

    return weightSum > 0 ? totalSimilarity / weightSum : 0;
  }

  /**
   * Generate reasons for content-based recommendations
   * @private
   */
  private generateContentBasedReasons(coffee: any, profile: any): string[] {
    const reasons: string[] = [];

    if (coffee.roastLevel && profile.roastLevels.has(coffee.roastLevel)) {
      reasons.push(`You enjoy ${coffee.roastLevel} roast coffees`);
    }

    if (coffee.origin?.country && profile.origins.has(coffee.origin.country)) {
      reasons.push(`You like coffees from ${coffee.origin.country}`);
    }

    if (
      coffee.processingDetails?.method &&
      profile.processingMethods.has(coffee.processingDetails.method)
    ) {
      reasons.push(`You prefer ${coffee.processingDetails.method} processed coffees`);
    }

    if (coffee.flavorProfile?.flavorNotes) {
      const matchingNotes = coffee.flavorProfile.flavorNotes.filter((note: string) =>
        profile.flavorNotes.has(note)
      );
      if (matchingNotes.length > 0) {
        reasons.push(`Features ${matchingNotes.slice(0, 2).join(' and ')} notes you enjoy`);
      }
    }

    return reasons.length > 0 ? reasons : ["Similar to coffees you've enjoyed"];
  }

  /**
   * Get popular coffees as recommendations
   * @private
   */
  private async getPopularityBasedRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = []
  ): Promise<InternalRecommendation[]> {
    try {
      const Coffee = mongoose.model('Coffee');

      // Get popular coffees based on average rating and rating count
      const popularCoffees = await Coffee.find({
        _id: { $nin: excludeCoffeeIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true,
        isAvailable: true,
        avgRating: { $gte: 4.0 }, // Only highly rated coffees
        ratingCount: { $gte: 5 }, // Must have at least 5 ratings
      })
        .sort({
          avgRating: -1,
          ratingCount: -1,
        })
        .limit(RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS)
        .lean();

      // Get interaction counts for additional popularity scoring
      const coffeeInteractionCounts = await UserInteraction.aggregate([
        {
          $match: {
            coffeeId: { $in: popularCoffees.map((c) => c._id) },
            interactionType: { $in: ['view', 'purchase', 'favorite', 'rating'] },
            timestamp: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
          },
        },
        {
          $group: {
            _id: '$coffeeId',
            totalInteractions: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: '$uniqueUsers' },
          },
        },
      ]);

      const interactionMap = new Map(
        coffeeInteractionCounts.map((item) => [
          item._id.toString(),
          { total: item.totalInteractions, unique: item.uniqueUserCount },
        ])
      );

      // Calculate popularity scores and create recommendations
      const recommendations: InternalRecommendation[] = popularCoffees.map((coffee, index) => {
        const coffeeId = coffee._id as string;
        const interactions = interactionMap.get(coffeeId.toString()) || { total: 0, unique: 0 };

        // Popularity score combines rating, rating count, and recent interactions
        const ratingScore = (coffee.avgRating / 5) * 0.4;
        const ratingCountScore = Math.min(coffee.ratingCount / 50, 1) * 0.3; // Normalize to max 50 ratings
        const interactionScore = Math.min(interactions.total / 100, 1) * 0.2; // Normalize to max 100 interactions
        const uniqueUserScore = Math.min(interactions.unique / 20, 1) * 0.1; // Normalize to max 20 unique users

        const popularityScore =
          (ratingScore + ratingCountScore + interactionScore + uniqueUserScore) *
          RECOMMENDATION_CONFIG.WEIGHTS.POPULARITY;

        return {
          userId,
          itemId: new mongoose.Types.ObjectId(coffeeId),
          itemType: 'coffee' as const,
          score: popularityScore,
          reason: `Popular choice with ${coffee.avgRating.toFixed(1)} stars from ${coffee.ratingCount} reviews`,
          algorithm: 'popularity',
          coffee,
          reasons: [
            `Highly rated (${coffee.avgRating.toFixed(1)}/5 stars)`,
            `${coffee.ratingCount} customer reviews`,
            interactions.total > 0
              ? `${interactions.total} recent interactions`
              : 'Trending coffee',
          ],
        };
      });

      logger.info(
        `Generated ${recommendations.length} popularity-based recommendations for user: ${userId}`
      );
      return recommendations;
    } catch (error) {
      logger.error('Error in popularity-based recommendations:', error);
      return [];
    }
  }

  /**
   * Get discovery recommendations (novel, diverse items)
   * @private
   */
  private async getDiscoveryRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = [],
    discoveryMode?: {
      algorithm?: 'epsilon-greedy' | 'ucb' | 'thompson-sampling' | 'hybrid';
      explorationRate?: number;
    }
  ): Promise<InternalRecommendation[]> {
    try {
      logger.info(`Generating discovery recommendations for user ${userId}`);

      // Use the new DiscoveryModeService for advanced bandit algorithms
      const banditAlgorithm = discoveryMode?.algorithm || 'hybrid';
      const limit = RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS;

      const banditRecommendations = await DiscoveryModeService.generateDiscoveryRecommendations(
        userId,
        excludeCoffeeIds,
        banditAlgorithm,
        limit
      );

      // banditRecommendations are already InternalRecommendation objects
      const discoveryRecommendations: InternalRecommendation[] = banditRecommendations;

      // If bandit recommendations are insufficient, fall back to the original discovery logic
      if (discoveryRecommendations.length < 5) {
        logger.info(
          `Bandit recommendations insufficient (${discoveryRecommendations.length}), adding fallback recommendations`
        );
        const fallbackRecommendations = await this.getFallbackDiscoveryRecommendations(
          userId,
          excludeCoffeeIds
        );

        // Merge recommendations, avoiding duplicates
        const existingIds = new Set(discoveryRecommendations.map((r) => r.itemId.toString()));
        const newFallbackRecs = fallbackRecommendations.filter(
          (r) => !existingIds.has(r.itemId.toString())
        );

        discoveryRecommendations.push(
          ...newFallbackRecs.slice(
            0,
            RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS - discoveryRecommendations.length
          )
        );
      }

      logger.info(
        `Generated ${discoveryRecommendations.length} discovery recommendations for user ${userId}`
      );
      return discoveryRecommendations;
    } catch (error) {
      logger.error('Error generating discovery recommendations:', error);
      // Fall back to original discovery logic if bandit service fails
      return this.getFallbackDiscoveryRecommendations(userId, excludeCoffeeIds);
    }
  }

  /**
   * Fallback discovery recommendations using the original trending-based approach
   * @private
   */
  private async getFallbackDiscoveryRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = []
  ): Promise<InternalRecommendation[]> {
    try {
      // Get user's interaction history to understand their typical preferences
      const userInteractions = await UserInteraction.find({
        userId,
        interactionType: { $in: ['rating', 'purchase', 'favorite'] },
        value: { $gte: 3 }, // Only positive interactions
      })
        .populate('coffeeId')
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();

      // Build user's typical preference profile
      const userPreferences = this.buildUserPreferenceProfile(userInteractions);

      const Coffee = mongoose.model('Coffee');

      // Find coffees that are different from user's typical preferences
      const diverseCoffees = await Coffee.find({
        _id: { $nin: excludeCoffeeIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true,
        isAvailable: true,
        avgRating: { $gte: 3.5 }, // Still maintain some quality threshold
      })
        .limit(100) // Get a larger pool to filter from
        .lean();

      // Score coffees based on how different they are from user preferences
      const discoveryRecommendations: InternalRecommendation[] = [];

      for (const coffee of diverseCoffees) {
        const coffeeId = coffee._id as string;
        const diversityScore = this.calculateDiversityScore(coffee, userPreferences);

        // Only recommend if it's sufficiently different (discovery threshold)
        if (diversityScore > 0.3) {
          const reasons = this.generateDiscoveryReasons(coffee, userPreferences);

          discoveryRecommendations.push({
            userId,
            itemId: new mongoose.Types.ObjectId(coffeeId),
            itemType: 'coffee' as const,
            score: diversityScore * RECOMMENDATION_CONFIG.WEIGHTS.DIVERSITY,
            reason: `Discover something new: ${reasons[0]}`,
            algorithm: 'discovery-fallback',
            coffee,
            reasons,
          });
        }
      }

      // Sort by diversity score and apply diversity rules
      const sortedRecommendations = discoveryRecommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS);

      // Apply diversity constraints to ensure variety
      const diversifiedRecommendations = this.applyDiversityConstraints(sortedRecommendations);

      logger.info(
        `Generated ${diversifiedRecommendations.length} fallback discovery recommendations for user: ${userId}`
      );
      return diversifiedRecommendations;
    } catch (error) {
      logger.error('Error in fallback discovery recommendations:', error);
      return [];
    }
  }

  /**
   * Calculate how different a coffee is from user's typical preferences
   * @private
   */
  private calculateDiversityScore(coffee: any, userPreferences: any): number {
    let diversityScore = 0;
    let factorCount = 0;

    // Check roast level diversity
    if (coffee.roastLevel && userPreferences.roastLevels.size > 0) {
      const isUnfamiliar = !userPreferences.roastLevels.has(coffee.roastLevel);
      diversityScore += isUnfamiliar ? 0.4 : 0.1;
      factorCount++;
    }

    // Check origin diversity
    if (coffee.origin?.country && userPreferences.origins.size > 0) {
      const isUnfamiliar = !userPreferences.origins.has(coffee.origin.country);
      diversityScore += isUnfamiliar ? 0.3 : 0.1;
      factorCount++;
    }

    // Check processing method diversity
    if (coffee.processingDetails?.method && userPreferences.processingMethods.size > 0) {
      const isUnfamiliar = !userPreferences.processingMethods.has(coffee.processingDetails.method);
      diversityScore += isUnfamiliar ? 0.2 : 0.05;
      factorCount++;
    }

    // Check flavor profile diversity
    if (coffee.flavorProfile?.flavorNotes && userPreferences.flavorNotes.size > 0) {
      const unfamiliarNotes = coffee.flavorProfile.flavorNotes.filter(
        (note: string) => !userPreferences.flavorNotes.has(note)
      );
      const diversityRatio = unfamiliarNotes.length / coffee.flavorProfile.flavorNotes.length;
      diversityScore += diversityRatio * 0.3;
      factorCount++;
    }

    return factorCount > 0 ? diversityScore / factorCount : 0;
  }

  /**
   * Generate reasons for discovery recommendations
   * @private
   */
  private generateDiscoveryReasons(coffee: any, userPreferences: any): string[] {
    const reasons: string[] = [];

    if (coffee.roastLevel && !userPreferences.roastLevels.has(coffee.roastLevel)) {
      reasons.push(`Try a ${coffee.roastLevel} roast - different from your usual preferences`);
    }

    if (coffee.origin?.country && !userPreferences.origins.has(coffee.origin.country)) {
      reasons.push(`Explore coffee from ${coffee.origin.country}`);
    }

    if (
      coffee.processingDetails?.method &&
      !userPreferences.processingMethods.has(coffee.processingDetails.method)
    ) {
      reasons.push(`Experience ${coffee.processingDetails.method} processing method`);
    }

    if (coffee.flavorProfile?.flavorNotes) {
      const unfamiliarNotes = coffee.flavorProfile.flavorNotes.filter(
        (note: string) => !userPreferences.flavorNotes.has(note)
      );
      if (unfamiliarNotes.length > 0) {
        reasons.push(`Discover new flavors: ${unfamiliarNotes.slice(0, 2).join(', ')}`);
      }
    }

    return reasons.length > 0 ? reasons : ['Expand your coffee horizons'];
  }

  /**
   * Apply diversity constraints to ensure variety in recommendations
   * @private
   */
  private applyDiversityConstraints(
    recommendations: InternalRecommendation[]
  ): InternalRecommendation[] {
    const diversified: InternalRecommendation[] = [];
    const originCount = new Map<string, number>();
    const roastLevelCount = new Map<string, number>();

    for (const rec of recommendations) {
      const coffee = rec.coffee;
      const origin = coffee.origin?.country || 'unknown';
      const roastLevel = coffee.roastLevel || 'unknown';

      // Check diversity constraints
      const currentOriginCount = originCount.get(origin) || 0;
      const currentRoastCount = roastLevelCount.get(roastLevel) || 0;

      if (
        currentOriginCount < RECOMMENDATION_CONFIG.DIVERSITY.MAX_FROM_SAME_ORIGIN &&
        currentRoastCount < RECOMMENDATION_CONFIG.DIVERSITY.MAX_FROM_SAME_ROAST_LEVEL
      ) {
        diversified.push(rec);
        originCount.set(origin, currentOriginCount + 1);
        roastLevelCount.set(roastLevel, currentRoastCount + 1);
      }

      // Stop when we have enough diverse recommendations
      if (diversified.length >= 20) break;
    }

    return diversified;
  }

  /**
   * Get recommendations based on social connections
   * @private
   */
  private async getSocialRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = []
  ): Promise<InternalRecommendation[]> {
    try {
      // Get user's social connections
      const SocialConnection = mongoose.model('SocialConnection');
      const connections = await SocialConnection.find({
        $or: [
          { userId: userId, status: 'accepted' },
          { connectedUserId: userId, status: 'accepted' },
        ],
      }).lean();

      if (connections.length === 0) {
        logger.info(`No social connections found for user: ${userId}`);
        return [];
      }

      // Extract connected user IDs
      const connectedUserIds = connections.map((conn) =>
        conn.userId.equals(userId) ? conn.connectedUserId : conn.userId
      );

      // Get highly-rated interactions from connected users
      const socialInteractions = await UserInteraction.find({
        userId: { $in: connectedUserIds },
        interactionType: { $in: ['rating', 'purchase', 'favorite'] },
        coffeeId: { $nin: excludeCoffeeIds.map((id) => new mongoose.Types.ObjectId(id)) },
        value: { $gte: 4 }, // Only high ratings
        timestamp: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }, // Last 60 days
      })
        .populate('coffeeId')
        .populate('userId', 'name username')
        .lean();

      // Group by coffee and calculate social scores
      const coffeeScores = new Map<
        string,
        {
          score: number;
          reasons: string[];
          coffee: any;
          likedBy: string[];
        }
      >();

      for (const interaction of socialInteractions) {
        if (!interaction.coffeeId) continue;

        const coffeeId = interaction.coffeeId._id.toString();
        const userObj = interaction.userId as any; // Populated user object
        const userName = userObj?.name || userObj?.username || 'A friend';
        const ratingValue = interaction.value || 5;

        // Calculate social influence score based on interaction type and recency
        const baseScore =
          {
            purchase: 1.0,
            rating: 0.8,
            favorite: 0.9,
          }[interaction.interactionType] || 0.5;

        const daysSince = (Date.now() - interaction.timestamp.getTime()) / (1000 * 60 * 60 * 24);
        const recencyWeight = Math.exp(-daysSince / 30); // Decay over 30 days
        const socialScore = (ratingValue / 5) * baseScore * recencyWeight;

        if (coffeeScores.has(coffeeId)) {
          const existing = coffeeScores.get(coffeeId)!;
          existing.score += socialScore;
          existing.likedBy.push(userName);
          existing.reasons.push(
            `${userName} ${this.getSocialActionText(interaction.interactionType)} this`
          );
        } else {
          coffeeScores.set(coffeeId, {
            score: socialScore,
            reasons: [`${userName} ${this.getSocialActionText(interaction.interactionType)} this`],
            coffee: interaction.coffeeId,
            likedBy: [userName],
          });
        }
      }

      // Convert to recommendations and sort by social score
      const recommendations: InternalRecommendation[] = Array.from(coffeeScores.entries())
        .map(([coffeeId, data]) => {
          // Deduplicate liked by names
          const uniqueLikedBy = [...new Set(data.likedBy)];
          const socialReason =
            uniqueLikedBy.length === 1
              ? `${uniqueLikedBy[0]} recommends this`
              : `${uniqueLikedBy.length} friends recommend this`;

          return {
            userId,
            itemId: new mongoose.Types.ObjectId(coffeeId),
            itemType: 'coffee' as const,
            score: Math.min(data.score, 1), // Normalize to max 1
            reason: socialReason,
            algorithm: 'social',
            coffee: data.coffee,
            reasons: [socialReason, ...data.reasons.slice(0, 2)], // Limit to avoid too many reasons
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS);

      logger.info(`Generated ${recommendations.length} social recommendations for user: ${userId}`);
      return recommendations;
    } catch (error) {
      logger.error('Error in social recommendations:', error);
      return [];
    }
  }

  /**
   * Get appropriate action text for social interactions
   * @private
   */
  private getSocialActionText(interactionType: string): string {
    switch (interactionType) {
      case 'purchase':
        return 'bought';
      case 'rating':
        return 'rated highly';
      case 'favorite':
        return 'favorited';
      default:
        return 'liked';
    }
  }

  /**
   * Get hybrid recommendations combining multiple algorithms
   * @private
   */
  private async getHybridRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = [],
    discoveryMode?: {
      algorithm?: 'epsilon-greedy' | 'ucb' | 'thompson-sampling' | 'hybrid';
      explorationRate?: number;
    }
  ): Promise<InternalRecommendation[]> {
    try {
      // Get recommendations from all algorithms
      const [collaborativeRecs, contentBasedRecs, popularityRecs, discoveryRecs, socialRecs] =
        await Promise.all([
          this.getCollaborativeFilteringRecommendations(userId, excludeCoffeeIds),
          this.getContentBasedRecommendations(userId, excludeCoffeeIds),
          this.getPopularityBasedRecommendations(userId, excludeCoffeeIds),
          this.getDiscoveryRecommendations(userId, excludeCoffeeIds, discoveryMode),
          this.getSocialRecommendations(userId, excludeCoffeeIds),
        ]);

      // Combine all recommendations into a single map
      const combinedScores = new Map<
        string,
        {
          totalScore: number;
          algorithms: string[];
          reasons: string[];
          coffee: any;
          algorithmScores: { [key: string]: number };
        }
      >();

      // Process each algorithm's recommendations
      const algorithmData = [
        {
          recs: collaborativeRecs,
          name: 'collaborative',
          weight: RECOMMENDATION_CONFIG.WEIGHTS.COLLABORATIVE,
        },
        {
          recs: contentBasedRecs,
          name: 'content-based',
          weight: RECOMMENDATION_CONFIG.WEIGHTS.CONTENT_BASED,
        },
        {
          recs: popularityRecs,
          name: 'popularity',
          weight: RECOMMENDATION_CONFIG.WEIGHTS.POPULARITY,
        },
        { recs: discoveryRecs, name: 'discovery', weight: RECOMMENDATION_CONFIG.WEIGHTS.DIVERSITY },
        { recs: socialRecs, name: 'social', weight: 0.15 }, // Social gets a small boost in hybrid
      ];

      for (const { recs, name, weight } of algorithmData) {
        for (const rec of recs) {
          const coffeeId = rec.itemId.toString();
          const weightedScore = rec.score * weight;

          if (combinedScores.has(coffeeId)) {
            const existing = combinedScores.get(coffeeId)!;
            existing.totalScore += weightedScore;
            existing.algorithms.push(name);
            existing.reasons.push(...(rec.reasons || [rec.reason]));
            existing.algorithmScores[name] = rec.score;
          } else {
            combinedScores.set(coffeeId, {
              totalScore: weightedScore,
              algorithms: [name],
              reasons: rec.reasons || [rec.reason],
              coffee: rec.coffee,
              algorithmScores: { [name]: rec.score },
            });
          }
        }
      }

      // Convert to final recommendations and sort by combined score
      const hybridRecommendations: InternalRecommendation[] = Array.from(combinedScores.entries())
        .map(([coffeeId, data]) => {
          // Create a comprehensive reason that mentions multiple algorithms
          const algorithmCount = data.algorithms.length;
          let hybridReason = '';

          if (algorithmCount === 1) {
            hybridReason = data.reasons[0] || 'Recommended for you';
          } else {
            const uniqueAlgorithms = [...new Set(data.algorithms)];
            hybridReason = `Recommended by ${uniqueAlgorithms.length} different factors`;
          }

          // Boost score for items recommended by multiple algorithms
          const diversityBonus = Math.min(algorithmCount * 0.1, 0.3);
          const finalScore = Math.min(data.totalScore + diversityBonus, 1);

          return {
            userId,
            itemId: new mongoose.Types.ObjectId(coffeeId),
            itemType: 'coffee' as const,
            score: finalScore,
            reason: hybridReason,
            algorithm: 'hybrid',
            coffee: data.coffee,
            reasons: this.consolidateHybridReasons(data.reasons, data.algorithms),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, RECOMMENDATION_CONFIG.MAX_RECOMMENDATIONS);

      // Apply final diversity rules to ensure variety
      const diversifiedRecommendations = this.applyDiversityConstraints(hybridRecommendations);

      logger.info(
        `Generated ${diversifiedRecommendations.length} hybrid recommendations for user: ${userId}`
      );
      return diversifiedRecommendations;
    } catch (error) {
      logger.error('Error in hybrid recommendations:', error);
      return [];
    }
  }

  /**
   * Consolidate reasons from multiple algorithms into a coherent explanation
   * @private
   */
  private consolidateHybridReasons(reasons: string[], algorithms: string[]): string[] {
    // Remove duplicates and limit to most important reasons
    const uniqueReasons = [...new Set(reasons)];
    const consolidatedReasons: string[] = [];

    // Prioritize certain types of reasons
    const priorityOrder = ['social', 'collaborative', 'content-based', 'popularity', 'discovery'];

    for (const algorithm of priorityOrder) {
      if (algorithms.includes(algorithm)) {
        const algorithmReasons = uniqueReasons.filter((reason) =>
          this.reasonBelongsToAlgorithm(reason, algorithm)
        );
        consolidatedReasons.push(...algorithmReasons.slice(0, 1)); // Take top reason per algorithm
      }
    }

    // Add any remaining unique reasons up to a limit
    const remainingReasons = uniqueReasons.filter(
      (reason) => !consolidatedReasons.includes(reason)
    );
    consolidatedReasons.push(...remainingReasons.slice(0, 2));

    return consolidatedReasons.slice(0, 4); // Max 4 reasons total
  }

  /**
   * Determine if a reason belongs to a specific algorithm
   * @private
   */
  private reasonBelongsToAlgorithm(reason: string, algorithm: string): boolean {
    const algorithmKeywords = {
      social: ['friend', 'recommends', 'bought', 'rated highly', 'favorited'],
      collaborative: ['similar taste', 'similar users', 'coffee enthusiasts'],
      'content-based': ['You enjoy', 'You like', 'You prefer', 'Features', 'Similar to'],
      popularity: ['Popular choice', 'Highly rated', 'stars', 'reviews', 'Trending'],
      discovery: ['Discover', 'Try a', 'Explore', 'Experience', 'different from', 'new flavors'],
    };

    const keywords = algorithmKeywords[algorithm as keyof typeof algorithmKeywords] || [];
    return keywords.some((keyword) => reason.toLowerCase().includes(keyword.toLowerCase()));
  }
}

export default new RecommendationEngine();
