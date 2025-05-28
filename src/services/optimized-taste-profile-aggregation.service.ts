/**
 * Optimized Taste Profile Aggregation Service
 * High-performance implementation with caching, optimized pipelines, and memory management
 */

import { Types } from 'mongoose';
// Note: Redis would need to be installed: npm install ioredis @types/ioredis
// import Redis from 'ioredis';

// Mock Redis interface for development
interface MockRedis {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<void>;
  del(key: string): Promise<void>;
  info(section: string): Promise<string>;
  keys(pattern: string): Promise<string[]>;
  quit(): Promise<void>;
}

// Mock implementations - replace with actual models when available
const Rating = {
  aggregate: (pipeline: any[]) => ({
    option: (opts: any) => ({
      exec: async () => []
    })
  })
};

const Coffee = {};
const TasteProfile = {};

// Mock logger - replace with actual logger implementation
const logger = {
  info: (message: string, meta?: any) => console.log(message, meta),
  warn: (message: string, error?: any) => console.warn(message, error),
  error: (message: string, error?: any) => console.error(message, error)
};

interface CacheConfig {
  ttl: number; // Time to live in seconds
  keyPrefix: string;
}

interface OptimizationConfig {
  maxRatingsPerQuery: number;
  timeWindowDays: number;
  enableCaching: boolean;
  batchSize: number;
}

interface BatchData {
  flavorProfiles: Map<string, { sum: number; count: number }>;
  origins: Map<string, { sum: number; count: number }>;
  processingMethods: Map<string, { sum: number; count: number }>;
  roastLevels: Map<string, { sum: number; count: number }>;
  ratingsCount: number;
}

export class OptimizedTasteProfileAggregationService {
  private redis: MockRedis;
  private cacheConfig: CacheConfig;
  private optimizationConfig: OptimizationConfig;

  constructor() {
    // Mock Redis implementation - replace with actual Redis when available
    this.redis = {
      async get(key: string): Promise<string | null> { return null; },
      async setex(key: string, ttl: number, value: string): Promise<void> {},
      async del(key: string): Promise<void> {},
      async info(section: string): Promise<string> { return ''; },
      async keys(pattern: string): Promise<string[]> { return []; },
      async quit(): Promise<void> {}
    };

    this.cacheConfig = {
      ttl: 3600, // 1 hour cache
      keyPrefix: 'taste_profile:',
    };

    this.optimizationConfig = {
      maxRatingsPerQuery: 500,
      timeWindowDays: 365, // Consider ratings from last year
      enableCaching: true,
      batchSize: 100,
    };
  }

  /**
   * Optimized user rating data aggregation with caching and performance improvements
   */
  async aggregateUserRatingData(userId: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.optimizationConfig.enableCaching) {
        const cachedData = await this.getCachedRatingData(userId);
        if (cachedData) {
          logger.info(`Cache hit for user ${userId}`, { 
            duration: Date.now() - startTime,
            source: 'cache' 
          });
          return cachedData;
        }
      }

      // Calculate cutoff date for time window
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.optimizationConfig.timeWindowDays);

      // Optimized aggregation pipeline
      const pipeline = this.buildOptimizedAggregationPipeline(userId, cutoffDate);
      
      // Execute aggregation with performance monitoring
      const ratingsWithCoffees = await Rating.aggregate(pipeline)
        .option({ allowDiskUse: true }) // Allow disk usage for large datasets
        .exec();

      // Process results in batches to manage memory
      const processedData = await this.processRatingDataInBatches(ratingsWithCoffees);

      // Cache the results
      if (this.optimizationConfig.enableCaching) {
        await this.cacheRatingData(userId, processedData);
      }

      logger.info(`Aggregation completed for user ${userId}`, {
        duration: Date.now() - startTime,
        ratingsCount: ratingsWithCoffees.length,
        source: 'database'
      });

      return processedData;

    } catch (error) {
      logger.error(`Error aggregating rating data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Build optimized aggregation pipeline with early filtering and projection
   */
  private buildOptimizedAggregationPipeline(userId: string, cutoffDate: Date): any[] {
    return [
      // Stage 1: Early filtering with compound index
      {
        $match: {
          userId: new Types.ObjectId(userId),
          createdAt: { $gte: cutoffDate },
          rating: { $gte: 1, $lte: 5 } // Ensure valid ratings
        }
      },

      // Stage 2: Sort early to leverage index
      {
        $sort: { createdAt: -1 }
      },

      // Stage 3: Limit results to prevent memory issues
      {
        $limit: this.optimizationConfig.maxRatingsPerQuery
      },

      // Stage 4: Optimized lookup with projection pipeline
      {
        $lookup: {
          from: 'coffees',
          localField: 'coffeeId',
          foreignField: '_id',
          as: 'coffee',
          pipeline: [
            {
              $project: {
                name: 1,
                origin: 1,
                processingMethod: 1,
                roastLevel: 1,
                flavorProfile: 1,
                // Only include essential fields
                _id: 1
              }
            }
          ]
        }
      },

      // Stage 5: Unwind coffee data
      {
        $unwind: {
          path: '$coffee',
          preserveNullAndEmptyArrays: false // Exclude ratings without coffee data
        }
      },

      // Stage 6: Project only necessary fields
      {
        $project: {
          _id: 1,
          rating: 1,
          notes: 1,
          createdAt: 1,
          'coffee.name': 1,
          'coffee.origin': 1,
          'coffee.processingMethod': 1,
          'coffee.roastLevel': 1,
          'coffee.flavorProfile': 1
        }
      },

      // Stage 7: Add computed fields for analysis
      {
        $addFields: {
          ratingWeight: {
            $multiply: [
              '$rating',
              {
                $divide: [
                  { $subtract: [new Date(), '$createdAt'] },
                  1000 * 60 * 60 * 24 * 30 // 30-day decay factor
                ]
              }
            ]
          }
        }
      }
    ];
  }

  /**
   * Process rating data in batches to manage memory usage
   */
  private async processRatingDataInBatches(ratingsData: any[]): Promise<any> {
    const batchSize = this.optimizationConfig.batchSize;
    const processedBatches: BatchData[] = [];

    for (let i = 0; i < ratingsData.length; i += batchSize) {
      const batch = ratingsData.slice(i, i + batchSize);
      const processedBatch = this.processBatch(batch);
      processedBatches.push(processedBatch);
    }

    // Combine all batches
    return this.combineBatches(processedBatches);
  }

  /**
   * Process a single batch of rating data
   */
  private processBatch(batch: any[]): BatchData {
    const flavorProfiles = new Map<string, { sum: number; count: number }>();
    const origins = new Map<string, { sum: number; count: number }>();
    const processingMethods = new Map<string, { sum: number; count: number }>();
    const roastLevels = new Map<string, { sum: number; count: number }>();

    batch.forEach(rating => {
      const coffee = rating.coffee;
      const weight = rating.ratingWeight || 1;

      // Aggregate flavor profiles
      if (coffee.flavorProfile) {
        Object.entries(coffee.flavorProfile).forEach(([flavor, value]) => {
          if (typeof value === 'number') {
            const current = flavorProfiles.get(flavor) || { sum: 0, count: 0 };
            flavorProfiles.set(flavor, {
              sum: current.sum + (value * weight),
              count: current.count + weight
            });
          }
        });
      }

      // Aggregate origins
      if (coffee.origin) {
        const current = origins.get(coffee.origin) || { sum: 0, count: 0 };
        origins.set(coffee.origin, {
          sum: current.sum + (rating.rating * weight),
          count: current.count + weight
        });
      }

      // Aggregate processing methods
      if (coffee.processingMethod) {
        const current = processingMethods.get(coffee.processingMethod) || { sum: 0, count: 0 };
        processingMethods.set(coffee.processingMethod, {
          sum: current.sum + (rating.rating * weight),
          count: current.count + weight
        });
      }

      // Aggregate roast levels
      if (coffee.roastLevel) {
        const current = roastLevels.get(coffee.roastLevel) || { sum: 0, count: 0 };
        roastLevels.set(coffee.roastLevel, {
          sum: current.sum + (rating.rating * weight),
          count: current.count + weight
        });
      }
    });

    return {
      flavorProfiles,
      origins,
      processingMethods,
      roastLevels,
      ratingsCount: batch.length
    };
  }

  /**
   * Combine processed batches into final result
   */
  private combineBatches(batches: BatchData[]): any {
    const combined = {
      flavorProfiles: new Map<string, { sum: number; count: number }>(),
      origins: new Map<string, { sum: number; count: number }>(),
      processingMethods: new Map<string, { sum: number; count: number }>(),
      roastLevels: new Map<string, { sum: number; count: number }>(),
      totalRatings: 0
    };

    batches.forEach(batch => {
      // Combine flavor profiles
      batch.flavorProfiles.forEach((value: { sum: number; count: number }, key: string) => {
        const current = combined.flavorProfiles.get(key) || { sum: 0, count: 0 };
        combined.flavorProfiles.set(key, {
          sum: current.sum + value.sum,
          count: current.count + value.count
        });
      });

      // Combine origins
      batch.origins.forEach((value: { sum: number; count: number }, key: string) => {
        const current = combined.origins.get(key) || { sum: 0, count: 0 };
        combined.origins.set(key, {
          sum: current.sum + value.sum,
          count: current.count + value.count
        });
      });

      // Combine processing methods
      batch.processingMethods.forEach((value: { sum: number; count: number }, key: string) => {
        const current = combined.processingMethods.get(key) || { sum: 0, count: 0 };
        combined.processingMethods.set(key, {
          sum: current.sum + value.sum,
          count: current.count + value.count
        });
      });

      // Combine roast levels
      batch.roastLevels.forEach((value: { sum: number; count: number }, key: string) => {
        const current = combined.roastLevels.get(key) || { sum: 0, count: 0 };
        combined.roastLevels.set(key, {
          sum: current.sum + value.sum,
          count: current.count + value.count
        });
      });

      combined.totalRatings += batch.ratingsCount;
    });

    // Convert Maps to Objects with averages
    return {
      flavorProfiles: this.mapToAverages(combined.flavorProfiles),
      origins: this.mapToAverages(combined.origins),
      processingMethods: this.mapToAverages(combined.processingMethods),
      roastLevels: this.mapToAverages(combined.roastLevels),
      totalRatings: combined.totalRatings,
      lastUpdated: new Date()
    };
  }

  /**
   * Convert Map with sum/count to averages
   */
  private mapToAverages(map: Map<string, { sum: number; count: number }>): Record<string, number> {
    const result: Record<string, number> = {};
    map.forEach((value, key) => {
      result[key] = value.count > 0 ? value.sum / value.count : 0;
    });
    return result;
  }

  /**
   * Get cached rating data for a user
   */
  private async getCachedRatingData(userId: string): Promise<any | null> {
    try {
      const cacheKey = `${this.cacheConfig.keyPrefix}${userId}`;
      const cachedData = await this.redis.get(cacheKey);
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        
        // Check if cache is still fresh
        const cacheAge = Date.now() - new Date(parsed.lastUpdated).getTime();
        if (cacheAge < this.cacheConfig.ttl * 1000) {
          return parsed;
        }
      }
      
      return null;
    } catch (error) {
      logger.warn(`Cache read error for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Cache rating data for a user
   */
  private async cacheRatingData(userId: string, data: any): Promise<void> {
    try {
      const cacheKey = `${this.cacheConfig.keyPrefix}${userId}`;
      await this.redis.setex(
        cacheKey,
        this.cacheConfig.ttl,
        JSON.stringify(data)
      );
    } catch (error) {
      logger.warn(`Cache write error for user ${userId}:`, error);
    }
  }

  /**
   * Invalidate cache for a user (call when user adds new ratings)
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      const cacheKey = `${this.cacheConfig.keyPrefix}${userId}`;
      await this.redis.del(cacheKey);
      logger.info(`Cache invalidated for user ${userId}`);
    } catch (error) {
      logger.warn(`Cache invalidation error for user ${userId}:`, error);
    }
  }

  /**
   * Get aggregation performance metrics
   */
  async getPerformanceMetrics(): Promise<any> {
    try {
      const cacheInfo = await this.redis.info('memory');
      const cacheKeys = await this.redis.keys(`${this.cacheConfig.keyPrefix}*`);
      
      return {
        cacheSize: cacheKeys.length,
        memoryUsage: cacheInfo,
        optimizationConfig: this.optimizationConfig,
        cacheConfig: this.cacheConfig
      };
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      return null;
    }
  }

  /**
   * Cleanup and close connections
   */
  async cleanup(): Promise<void> {
    await this.redis.quit();
  }
}

export default OptimizedTasteProfileAggregationService; 