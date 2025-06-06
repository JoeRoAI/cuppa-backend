/**
 * TasteProfileAggregationService
 * Service for aggregating user rating data and generating comprehensive taste profiles
 */

import mongoose from 'mongoose';
import Rating from '../models/rating.model';
import Coffee from '../models/coffee.model';
import TasteProfile, {
  ITasteProfileDocument,
  CoffeeAttribute,
  IPreferredAttribute,
  IPreferredFlavorProfile,
  IPreferredCharacteristics,
  IRatingPatterns,
} from '../models/taste-profile.model';
import logger from '../utils/logger';

interface RatingAggregationData {
  userId: mongoose.Types.ObjectId;
  ratings: any[];
  coffees: any[];
}

interface AttributeStats {
  attribute: CoffeeAttribute;
  ratings: number[];
  averageRating: number;
  count: number;
  variance: number;
  preferenceScore: number;
  confidence: number;
}

class TasteProfileAggregationService {
  /**
   * Generate or update a user's taste profile based on their ratings
   * @param userId - The user ID to generate profile for
   * @returns The generated or updated taste profile
   */
  async generateTasteProfile(userId: string): Promise<ITasteProfileDocument> {
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      logger.info(`Generating taste profile for user: ${userId}`);

      // Aggregate user rating data
      const aggregationData = await this.aggregateUserRatingData(userObjectId);

      if (aggregationData.ratings.length === 0) {
        logger.info(`No ratings found for user ${userId}, creating empty profile`);
        return await this.createEmptyProfile(userObjectId);
      }

      // Calculate taste preferences
      const preferredAttributes = await this.calculateAttributePreferences(aggregationData);
      const preferredFlavorProfiles = await this.calculateFlavorPreferences(aggregationData);
      const preferredCharacteristics =
        await this.calculateCharacteristicPreferences(aggregationData);
      const ratingPatterns = await this.calculateRatingPatterns(aggregationData);

      // Calculate overall profile confidence
      const profileConfidence = this.calculateProfileConfidence(
        aggregationData.ratings.length,
        preferredAttributes,
        ratingPatterns
      );

      // Create or update taste profile
      const tasteProfile = await TasteProfile.findOneAndUpdate(
        { userId: userObjectId },
        {
          userId: userObjectId,
          preferredAttributes,
          preferredFlavorProfiles,
          preferredCharacteristics,
          ratingPatterns,
          totalRatings: aggregationData.ratings.length,
          lastRatingDate:
            aggregationData.ratings.length > 0
              ? new Date(
                  Math.max(...aggregationData.ratings.map((r) => new Date(r.createdAt).getTime()))
                )
              : undefined,
          profileConfidence,
          lastCalculated: new Date(),
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

      logger.info(
        `Successfully generated taste profile for user ${userId} with confidence ${profileConfidence}%`
      );
      return tasteProfile;
    } catch (error) {
      logger.error(`Error generating taste profile for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Aggregate all rating data for a user including coffee metadata
   * @private
   */
  private async aggregateUserRatingData(
    userId: mongoose.Types.ObjectId
  ): Promise<RatingAggregationData> {
    try {
      // Get all user ratings with coffee details
      const ratingsWithCoffees = await Rating.aggregate([
        { $match: { userId } },
        {
          $lookup: {
            from: 'coffees',
            localField: 'coffeeId',
            foreignField: '_id',
            as: 'coffee',
          },
        },
        { $unwind: '$coffee' },
        {
          $project: {
            _id: 1,
            userId: 1,
            coffeeId: 1,
            overall: 1,
            aroma: 1,
            flavor: 1,
            aftertaste: 1,
            acidity: 1,
            body: 1,
            balance: 1,
            uniformity: 1,
            cleanCup: 1,
            sweetness: 1,
            comment: 1,
            createdAt: 1,
            'coffee.name': 1,
            'coffee.origin': 1,
            'coffee.roastLevel': 1,
            'coffee.processingDetails': 1,
            'coffee.flavorProfile': 1,
            'coffee.categories': 1,
            'coffee.tags': 1,
          },
        },
        { $sort: { createdAt: -1 } },
      ]);

      const ratings = ratingsWithCoffees.map((item) => ({
        ...item,
        coffee: item.coffee,
      }));

      const coffees = ratingsWithCoffees.map((item) => item.coffee);

      return {
        userId,
        ratings,
        coffees,
      };
    } catch (error) {
      logger.error('Error aggregating user rating data:', error);
      throw error;
    }
  }

  /**
   * Calculate attribute preferences with confidence scoring
   * @private
   */
  private async calculateAttributePreferences(
    data: RatingAggregationData
  ): Promise<IPreferredAttribute[]> {
    const attributes = [
      CoffeeAttribute.ACIDITY,
      CoffeeAttribute.BODY,
      CoffeeAttribute.SWEETNESS,
      CoffeeAttribute.AROMA,
      CoffeeAttribute.FLAVOR,
      CoffeeAttribute.AFTERTASTE,
      CoffeeAttribute.BALANCE,
      CoffeeAttribute.UNIFORMITY,
      CoffeeAttribute.CLEAN_CUP,
    ];

    const attributePreferences: IPreferredAttribute[] = [];

    for (const attribute of attributes) {
      const attributeKey = attribute === CoffeeAttribute.CLEAN_CUP ? 'cleanCup' : attribute;

      // Get all ratings for this attribute
      const attributeRatings = data.ratings
        .filter((rating) => rating[attributeKey] !== undefined && rating[attributeKey] !== null)
        .map((rating) => ({
          attributeRating: rating[attributeKey],
          overallRating: rating.overall,
        }));

      if (attributeRatings.length === 0) {
        // No data for this attribute
        attributePreferences.push({
          attribute,
          preferenceScore: 50, // Neutral
          confidence: 0,
          averageRating: 0,
          ratingCount: 0,
        });
        continue;
      }

      const stats = this.calculateAttributeStats(attribute, attributeRatings);
      attributePreferences.push({
        attribute,
        preferenceScore: stats.preferenceScore,
        confidence: stats.confidence,
        averageRating: stats.averageRating,
        ratingCount: stats.count,
      });
    }

    return attributePreferences;
  }

  /**
   * Calculate statistical metrics for an attribute
   * @private
   */
  private calculateAttributeStats(
    attribute: CoffeeAttribute,
    ratings: { attributeRating: number; overallRating: number }[]
  ): AttributeStats {
    const attributeValues = ratings.map((r) => r.attributeRating);
    const overallValues = ratings.map((r) => r.overallRating);

    const count = attributeValues.length;
    const averageRating = attributeValues.reduce((sum, val) => sum + val, 0) / count;
    const averageOverall = overallValues.reduce((sum, val) => sum + val, 0) / count;

    // Calculate variance
    const variance =
      attributeValues.reduce((sum, val) => sum + Math.pow(val - averageRating, 2), 0) / count;

    // Calculate preference score (0-100)
    // Higher scores indicate stronger preference for this attribute
    const preferenceScore = Math.min(
      100,
      Math.max(
        0,
        (averageRating - 1) * 25 + // Base score from average rating
          (averageOverall - 3) * 10 // Bonus for high overall ratings when this attribute is present
      )
    );

    // Calculate confidence (0-100)
    // Higher confidence with more data points and lower variance
    const dataConfidence = Math.min(50, count * 2); // Up to 50 points for data volume
    const consistencyConfidence = Math.max(0, 50 - variance * 10); // Up to 50 points for consistency
    const confidence = Math.min(100, dataConfidence + consistencyConfidence);

    return {
      attribute,
      ratings: attributeValues,
      averageRating,
      count,
      variance,
      preferenceScore,
      confidence,
    };
  }

  /**
   * Calculate flavor profile preferences
   * @private
   */
  private async calculateFlavorPreferences(
    data: RatingAggregationData
  ): Promise<IPreferredFlavorProfile[]> {
    const flavorMap = new Map<string, { ratings: number[]; count: number }>();

    // Aggregate flavor notes from coffee flavor profiles
    data.ratings.forEach((rating) => {
      if (rating.coffee?.flavorProfile?.flavorNotes) {
        rating.coffee.flavorProfile.flavorNotes.forEach((flavor: string) => {
          if (!flavorMap.has(flavor)) {
            flavorMap.set(flavor, { ratings: [], count: 0 });
          }
          flavorMap.get(flavor)!.ratings.push(rating.overall);
          flavorMap.get(flavor)!.count++;
        });
      }
    });

    const flavorPreferences: IPreferredFlavorProfile[] = [];

    for (const [flavorNote, data] of flavorMap.entries()) {
      const averageRating =
        data.ratings.reduce((sum, rating) => sum + rating, 0) / data.ratings.length;
      const frequency = data.count;

      // Calculate preference score based on average rating and frequency
      const preferenceScore = Math.min(
        100,
        Math.max(
          0,
          (averageRating - 1) * 20 + // Base score from average rating
            Math.min(30, frequency * 3) // Bonus for frequency (up to 30 points)
        )
      );

      flavorPreferences.push({
        flavorNote,
        frequency,
        preferenceScore,
        averageRating,
      });
    }

    // Sort by preference score and return top flavors
    return flavorPreferences.sort((a, b) => b.preferenceScore - a.preferenceScore).slice(0, 20); // Keep top 20 flavors
  }

  /**
   * Calculate characteristic preferences (roast levels, origins, processing methods)
   * @private
   */
  private async calculateCharacteristicPreferences(
    data: RatingAggregationData
  ): Promise<IPreferredCharacteristics> {
    // Roast levels
    const roastLevelMap = new Map<string, { ratings: number[]; count: number }>();

    // Origins
    const originMap = new Map<string, { ratings: number[]; count: number; regions: Set<string> }>();

    // Processing methods
    const processingMap = new Map<string, { ratings: number[]; count: number }>();

    data.ratings.forEach((rating) => {
      const coffee = rating.coffee;

      // Roast level
      if (coffee?.roastLevel) {
        if (!roastLevelMap.has(coffee.roastLevel)) {
          roastLevelMap.set(coffee.roastLevel, { ratings: [], count: 0 });
        }
        roastLevelMap.get(coffee.roastLevel)!.ratings.push(rating.overall);
        roastLevelMap.get(coffee.roastLevel)!.count++;
      }

      // Origin
      if (coffee?.origin?.country) {
        const country = coffee.origin.country;
        if (!originMap.has(country)) {
          originMap.set(country, { ratings: [], count: 0, regions: new Set() });
        }
        originMap.get(country)!.ratings.push(rating.overall);
        originMap.get(country)!.count++;
        if (coffee.origin.region) {
          originMap.get(country)!.regions.add(coffee.origin.region);
        }
      }

      // Processing method
      if (coffee?.processingDetails?.method) {
        const method = coffee.processingDetails.method;
        if (!processingMap.has(method)) {
          processingMap.set(method, { ratings: [], count: 0 });
        }
        processingMap.get(method)!.ratings.push(rating.overall);
        processingMap.get(method)!.count++;
      }
    });

    // Convert maps to arrays with averages
    const roastLevels = Array.from(roastLevelMap.entries())
      .map(([level, data]) => ({
        level,
        frequency: data.count,
        averageRating: data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length,
      }))
      .sort((a, b) => b.averageRating - a.averageRating);

    const origins = Array.from(originMap.entries())
      .map(([country, data]) => ({
        country,
        region: data.regions.size === 1 ? Array.from(data.regions)[0] : undefined,
        frequency: data.count,
        averageRating: data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length,
      }))
      .sort((a, b) => b.averageRating - a.averageRating);

    const processingMethods = Array.from(processingMap.entries())
      .map(([method, data]) => ({
        method,
        frequency: data.count,
        averageRating: data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length,
      }))
      .sort((a, b) => b.averageRating - a.averageRating);

    return {
      roastLevels,
      origins,
      processingMethods,
    };
  }

  /**
   * Calculate rating patterns and behavioral statistics
   * @private
   */
  private async calculateRatingPatterns(data: RatingAggregationData): Promise<IRatingPatterns> {
    const ratings = data.ratings.map((r) => r.overall);
    const totalRatings = ratings.length;

    // Overall rating distribution
    const distributionMap = new Map<number, number>();
    ratings.forEach((rating) => {
      distributionMap.set(rating, (distributionMap.get(rating) || 0) + 1);
    });

    const overallRatingDistribution = Array.from(distributionMap.entries())
      .map(([rating, count]) => ({
        rating,
        count,
        percentage: (count / totalRatings) * 100,
      }))
      .sort((a, b) => a.rating - b.rating);

    // Calculate average and variance
    const averageOverallRating = ratings.reduce((sum, r) => sum + r, 0) / totalRatings;
    const ratingVariance =
      ratings.reduce((sum, r) => sum + Math.pow(r - averageOverallRating, 2), 0) / totalRatings;

    // Temporal patterns
    const hourCounts = new Map<number, number>();
    const dayCounts = new Map<number, number>();

    data.ratings.forEach((rating) => {
      const date = new Date(rating.createdAt);
      const hour = date.getHours();
      const day = date.getDay() + 1; // Convert to 1-7 format

      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    });

    const mostActiveTimeOfDay =
      hourCounts.size > 0
        ? Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
        : undefined;

    const mostActiveDay =
      dayCounts.size > 0
        ? Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
        : undefined;

    // Rating trends (simplified - could be enhanced with more sophisticated time series analysis)
    const ratingTrends = this.calculateRatingTrends(data.ratings);

    return {
      overallRatingDistribution,
      averageOverallRating,
      ratingVariance,
      mostActiveTimeOfDay,
      mostActiveDay,
      ratingTrends,
    };
  }

  /**
   * Calculate rating trends over time
   * @private
   */
  private calculateRatingTrends(ratings: any[]): IRatingPatterns['ratingTrends'] {
    const now = new Date();
    const trends = [];

    // Weekly trend
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weeklyRatings = ratings.filter((r) => new Date(r.createdAt) >= weekAgo);
    if (weeklyRatings.length > 0) {
      trends.push({
        period: 'week',
        averageRating: weeklyRatings.reduce((sum, r) => sum + r.overall, 0) / weeklyRatings.length,
        ratingCount: weeklyRatings.length,
      });
    }

    // Monthly trend
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthlyRatings = ratings.filter((r) => new Date(r.createdAt) >= monthAgo);
    if (monthlyRatings.length > 0) {
      trends.push({
        period: 'month',
        averageRating:
          monthlyRatings.reduce((sum, r) => sum + r.overall, 0) / monthlyRatings.length,
        ratingCount: monthlyRatings.length,
      });
    }

    // Quarterly trend
    const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const quarterlyRatings = ratings.filter((r) => new Date(r.createdAt) >= quarterAgo);
    if (quarterlyRatings.length > 0) {
      trends.push({
        period: 'quarter',
        averageRating:
          quarterlyRatings.reduce((sum, r) => sum + r.overall, 0) / quarterlyRatings.length,
        ratingCount: quarterlyRatings.length,
      });
    }

    return trends;
  }

  /**
   * Calculate overall profile confidence score
   * @private
   */
  private calculateProfileConfidence(
    totalRatings: number,
    attributes: IPreferredAttribute[],
    patterns: IRatingPatterns
  ): number {
    // Data volume confidence (0-40 points)
    const volumeConfidence = Math.min(40, totalRatings * 2);

    // Attribute confidence (0-30 points)
    const avgAttributeConfidence =
      attributes.length > 0
        ? attributes.reduce((sum, attr) => sum + attr.confidence, 0) / attributes.length
        : 0;
    const attributeConfidence = (avgAttributeConfidence / 100) * 30;

    // Consistency confidence (0-30 points)
    const consistencyConfidence = Math.max(0, 30 - patterns.ratingVariance * 15);

    return Math.min(
      100,
      Math.round(volumeConfidence + attributeConfidence + consistencyConfidence)
    );
  }

  /**
   * Create an empty taste profile for users with no ratings
   * @private
   */
  private async createEmptyProfile(
    userId: mongoose.Types.ObjectId
  ): Promise<ITasteProfileDocument> {
    const emptyProfile = new TasteProfile({
      userId,
      preferredAttributes: Object.values(CoffeeAttribute).map((attribute) => ({
        attribute,
        preferenceScore: 50, // Neutral
        confidence: 0,
        averageRating: 0,
        ratingCount: 0,
      })),
      preferredFlavorProfiles: [],
      preferredCharacteristics: {
        roastLevels: [],
        origins: [],
        processingMethods: [],
      },
      ratingPatterns: {
        overallRatingDistribution: [],
        averageOverallRating: 0,
        ratingVariance: 0,
        ratingTrends: [],
      },
      totalRatings: 0,
      profileConfidence: 0,
      lastCalculated: new Date(),
    });

    return await emptyProfile.save();
  }

  /**
   * Get taste profile for a user
   * @param userId - The user ID
   * @returns The user's taste profile or null if not found
   */
  async getTasteProfile(userId: string): Promise<ITasteProfileDocument | null> {
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      return await TasteProfile.findOne({ userId: userObjectId });
    } catch (error) {
      logger.error(`Error getting taste profile for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update taste profile when new ratings are added
   * @param userId - The user ID
   * @returns The updated taste profile
   */
  async updateTasteProfile(userId: string): Promise<ITasteProfileDocument> {
    return await this.generateTasteProfile(userId);
  }

  /**
   * Get taste profiles that need updating (based on new ratings)
   * @param hoursThreshold - Hours since last calculation to consider stale
   * @returns Array of user IDs that need profile updates
   */
  async getStaleProfiles(hoursThreshold: number = 24): Promise<string[]> {
    try {
      const thresholdDate = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

      // Find users with ratings newer than their last profile calculation
      const staleProfiles = await Rating.aggregate([
        {
          $group: {
            _id: '$userId',
            lastRating: { $max: '$createdAt' },
          },
        },
        {
          $lookup: {
            from: 'tasteprofiles',
            localField: '_id',
            foreignField: 'userId',
            as: 'profile',
          },
        },
        {
          $match: {
            $or: [
              { profile: { $size: 0 } }, // No profile exists
              {
                $expr: {
                  $gt: ['$lastRating', { $arrayElemAt: ['$profile.lastCalculated', 0] }],
                },
              }, // Rating newer than profile
              {
                $expr: {
                  $lt: [{ $arrayElemAt: ['$profile.lastCalculated', 0] }, thresholdDate],
                },
              }, // Profile is stale
            ],
          },
        },
        {
          $project: {
            userId: '$_id',
            _id: 0,
          },
        },
      ]);

      return staleProfiles.map((item) => item.userId.toString());
    } catch (error) {
      logger.error('Error getting stale profiles:', error);
      throw error;
    }
  }

  /**
   * Batch update multiple taste profiles
   * @param userIds - Array of user IDs to update
   * @returns Number of profiles updated
   */
  async batchUpdateProfiles(userIds: string[]): Promise<number> {
    let updatedCount = 0;

    for (const userId of userIds) {
      try {
        await this.generateTasteProfile(userId);
        updatedCount++;
      } catch (error) {
        logger.error(`Error updating profile for user ${userId}:`, error);
        // Continue with other users
      }
    }

    logger.info(`Batch updated ${updatedCount} out of ${userIds.length} taste profiles`);
    return updatedCount;
  }
}

export default new TasteProfileAggregationService();
