/**
 * DataIngestionService.ts
 * Service for handling data ingestion, validation, and processing for the recommendation system
 */

import mongoose from 'mongoose';
import { UserInteraction, IUserInteraction } from '../models/recommendation.model';
import User from '../models/user.model';
import Coffee from '../models/coffee.model';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

// Data validation schemas
interface RawInteractionData {
  userId: string;
  coffeeId: string;
  interactionType: string;
  value?: number;
  timestamp?: Date | string;
  metadata?: {
    deviceType?: string;
    location?: string;
    timeOfDay?: string;
    dayOfWeek?: number;
    sessionId?: string;
    referrer?: string;
    [key: string]: any;
  };
}

interface BatchProcessingOptions {
  batchSize?: number;
  validateData?: boolean;
  skipDuplicates?: boolean;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, data: RawInteractionData) => void;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

class DataIngestionService extends EventEmitter {
  private readonly VALID_INTERACTION_TYPES = [
    'view', 'click', 'search', 'favorite', 'purchase', 'rating', 'share', 'review'
  ];

  private readonly BATCH_SIZE_DEFAULT = 1000;
  private readonly MAX_BATCH_SIZE = 10000;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Batch process historical interaction data
   * @param data Array of raw interaction data
   * @param options Processing options
   * @returns Processing results
   */
  async batchProcessInteractions(
    data: RawInteractionData[],
    options: BatchProcessingOptions = {}
  ): Promise<{
    processed: number;
    failed: number;
    duplicates: number;
    errors: Array<{ data: RawInteractionData; error: string }>;
  }> {
    const {
      batchSize = this.BATCH_SIZE_DEFAULT,
      validateData = true,
      skipDuplicates = true,
      onProgress,
      onError
    } = options;

    const results = {
      processed: 0,
      failed: 0,
      duplicates: 0,
      errors: [] as Array<{ data: RawInteractionData; error: string }>
    };

    const effectiveBatchSize = Math.min(batchSize, this.MAX_BATCH_SIZE);
    const totalBatches = Math.ceil(data.length / effectiveBatchSize);

    logger.info(`Starting batch processing of ${data.length} interactions in ${totalBatches} batches`);

    for (let i = 0; i < data.length; i += effectiveBatchSize) {
      const batch = data.slice(i, i + effectiveBatchSize);
      const batchNumber = Math.floor(i / effectiveBatchSize) + 1;

      try {
        const batchResults = await this.processBatch(batch, {
          validateData,
          skipDuplicates,
          onError
        });

        results.processed += batchResults.processed;
        results.failed += batchResults.failed;
        results.duplicates += batchResults.duplicates;
        results.errors.push(...batchResults.errors);

        // Emit progress event
        this.emit('batchProgress', {
          batchNumber,
          totalBatches,
          processed: results.processed,
          failed: results.failed
        });

        // Call progress callback if provided
        if (onProgress) {
          onProgress(results.processed, data.length);
        }

        logger.info(`Batch ${batchNumber}/${totalBatches} completed: ${batchResults.processed} processed, ${batchResults.failed} failed`);

      } catch (error) {
        logger.error(`Error processing batch ${batchNumber}:`, error);
        results.failed += batch.length;
      }
    }

    logger.info(`Batch processing completed: ${results.processed} processed, ${results.failed} failed, ${results.duplicates} duplicates`);
    this.emit('batchComplete', results);

    return results;
  }

  /**
   * Process a single batch of interactions
   * @private
   */
  private async processBatch(
    batch: RawInteractionData[],
    options: {
      validateData: boolean;
      skipDuplicates: boolean;
      onError?: (error: Error, data: RawInteractionData) => void;
    }
  ): Promise<{
    processed: number;
    failed: number;
    duplicates: number;
    errors: Array<{ data: RawInteractionData; error: string }>;
  }> {
    const results = {
      processed: 0,
      failed: 0,
      duplicates: 0,
      errors: [] as Array<{ data: RawInteractionData; error: string }>
    };

    const validatedData: IUserInteraction[] = [];

    // Validate and transform data
    for (const rawData of batch) {
      try {
        if (options.validateData) {
          const validation = await this.validateInteractionData(rawData);
          if (!validation.isValid) {
            results.failed++;
            const error = `Validation failed: ${validation.errors.join(', ')}`;
            results.errors.push({ data: rawData, error });
            if (options.onError) {
              options.onError(new Error(error), rawData);
            }
            continue;
          }
        }

        const transformedData = await this.transformInteractionData(rawData);
        validatedData.push(transformedData);

      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({ data: rawData, error: errorMessage });
        if (options.onError) {
          options.onError(error instanceof Error ? error : new Error(errorMessage), rawData);
        }
      }
    }

    // Check for duplicates if enabled
    if (options.skipDuplicates && validatedData.length > 0) {
      const uniqueData = await this.filterDuplicates(validatedData);
      results.duplicates = validatedData.length - uniqueData.length;
      validatedData.splice(0, validatedData.length, ...uniqueData);
    }

    // Bulk insert validated data
    if (validatedData.length > 0) {
      try {
        await UserInteraction.insertMany(validatedData, { ordered: false });
        results.processed = validatedData.length;
      } catch (error) {
        logger.error('Error during bulk insert:', error);
        results.failed += validatedData.length;
      }
    }

    return results;
  }

  /**
   * Validate interaction data
   * @param data Raw interaction data
   * @returns Validation result
   */
  async validateInteractionData(data: RawInteractionData): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Required field validation
    if (!data.userId) {
      result.errors.push('userId is required');
    }

    if (!data.coffeeId) {
      result.errors.push('coffeeId is required');
    }

    if (!data.interactionType) {
      result.errors.push('interactionType is required');
    }

    // Validate interaction type
    if (data.interactionType && !this.VALID_INTERACTION_TYPES.includes(data.interactionType)) {
      result.errors.push(`Invalid interactionType: ${data.interactionType}. Valid types: ${this.VALID_INTERACTION_TYPES.join(', ')}`);
    }

    // Validate ObjectId format
    if (data.userId && !mongoose.Types.ObjectId.isValid(data.userId)) {
      result.errors.push('Invalid userId format');
    }

    if (data.coffeeId && !mongoose.Types.ObjectId.isValid(data.coffeeId)) {
      result.errors.push('Invalid coffeeId format');
    }

    // Validate value for rating interactions
    if (data.interactionType === 'rating') {
      if (data.value === undefined || data.value === null) {
        result.errors.push('value is required for rating interactions');
      } else if (data.value < 1 || data.value > 5) {
        result.errors.push('rating value must be between 1 and 5');
      }
    }

    // Validate timestamp
    if (data.timestamp) {
      const timestamp = new Date(data.timestamp);
      if (isNaN(timestamp.getTime())) {
        result.errors.push('Invalid timestamp format');
      } else if (timestamp > new Date()) {
        result.warnings.push('Timestamp is in the future');
      }
    }

    // Check if user and coffee exist (optional validation)
    try {
      if (data.userId && mongoose.Types.ObjectId.isValid(data.userId)) {
        const userExists = await User.exists({ _id: data.userId });
        if (!userExists) {
          result.warnings.push('User does not exist');
        }
      }

      if (data.coffeeId && mongoose.Types.ObjectId.isValid(data.coffeeId)) {
        const coffeeExists = await Coffee.exists({ _id: data.coffeeId });
        if (!coffeeExists) {
          result.warnings.push('Coffee does not exist');
        }
      }
    } catch (error) {
      logger.warn('Error validating user/coffee existence:', error);
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Transform raw data into UserInteraction format
   * @param data Raw interaction data
   * @returns Transformed interaction data
   */
  async transformInteractionData(data: RawInteractionData): Promise<IUserInteraction> {
    const transformed = {
      userId: new mongoose.Types.ObjectId(data.userId),
      coffeeId: new mongoose.Types.ObjectId(data.coffeeId),
      interactionType: data.interactionType,
      value: data.value || null,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      metadata: data.metadata || {}
    } as IUserInteraction;

    // Ensure metadata exists before accessing it
    if (!transformed.metadata) {
      transformed.metadata = {};
    }

    // Enrich metadata with derived fields
    if (!transformed.metadata.timeOfDay && transformed.timestamp) {
      transformed.metadata.timeOfDay = this.getTimeOfDay(transformed.timestamp);
    }

    if (!transformed.metadata.dayOfWeek && transformed.timestamp) {
      transformed.metadata.dayOfWeek = transformed.timestamp.getDay();
    }

    return transformed;
  }

  /**
   * Filter out duplicate interactions
   * @param data Array of interaction data
   * @returns Filtered array without duplicates
   */
  async filterDuplicates(data: IUserInteraction[]): Promise<IUserInteraction[]> {
    if (data.length === 0) return data;

    // Create a map of existing interactions for quick lookup
    const existingInteractions = new Set<string>();

    // Query existing interactions in batches
    const userIds = [...new Set(data.map(d => d.userId.toString()))];
    const coffeeIds = [...new Set(data.map(d => d.coffeeId.toString()))];

    const existing = await UserInteraction.find({
      userId: { $in: userIds },
      coffeeId: { $in: coffeeIds }
    }).select('userId coffeeId interactionType timestamp').lean();

    // Create lookup keys for existing interactions
    existing.forEach(interaction => {
      const key = `${interaction.userId}_${interaction.coffeeId}_${interaction.interactionType}_${interaction.timestamp.getTime()}`;
      existingInteractions.add(key);
    });

    // Filter out duplicates
    return data.filter(interaction => {
      const key = `${interaction.userId}_${interaction.coffeeId}_${interaction.interactionType}_${interaction.timestamp.getTime()}`;
      return !existingInteractions.has(key);
    });
  }

  /**
   * Real-time interaction ingestion
   * @param data Single interaction data
   * @returns Processing result
   */
  async ingestRealTimeInteraction(data: RawInteractionData): Promise<{
    success: boolean;
    interactionId?: mongoose.Types.ObjectId;
    error?: string;
  }> {
    try {
      // Validate data
      const validation = await this.validateInteractionData(data);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`
        };
      }

      // Transform data
      const transformedData = await this.transformInteractionData(data);

      // Save interaction
      const interaction = new UserInteraction(transformedData);
      await interaction.save();

      // Emit real-time event
      this.emit('realTimeInteraction', {
        interactionId: interaction._id as mongoose.Types.ObjectId,
        userId: interaction.userId,
        coffeeId: interaction.coffeeId,
        interactionType: interaction.interactionType
      });

      logger.debug(`Real-time interaction ingested: ${interaction._id}`);

      return {
        success: true,
        interactionId: interaction._id as mongoose.Types.ObjectId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error ingesting real-time interaction:', error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Setup event handlers for monitoring
   * @private
   */
  private setupEventHandlers(): void {
    this.on('batchProgress', (data) => {
      logger.info(`Batch progress: ${data.batchNumber}/${data.totalBatches} - Processed: ${data.processed}, Failed: ${data.failed}`);
    });

    this.on('batchComplete', (results) => {
      logger.info(`Batch processing complete - Total processed: ${results.processed}, Failed: ${results.failed}, Duplicates: ${results.duplicates}`);
    });

    this.on('realTimeInteraction', (data) => {
      logger.debug(`Real-time interaction processed: ${data.interactionId} for user ${data.userId}`);
    });
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
   * Get ingestion statistics
   * @returns Statistics about recent ingestion activity
   */
  async getIngestionStats(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalInteractions: number;
    interactionsByType: Record<string, number>;
    averagePerHour: number;
    lastIngestionTime: Date | null;
  }> {
    const now = new Date();
    let startTime: Date;

    switch (timeframe) {
      case 'hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'day':
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
    }

    const [totalResult, typeResults, lastInteraction] = await Promise.all([
      UserInteraction.countDocuments({ timestamp: { $gte: startTime } }),
      UserInteraction.aggregate([
        { $match: { timestamp: { $gte: startTime } } },
        { $group: { _id: '$interactionType', count: { $sum: 1 } } }
      ]),
      UserInteraction.findOne({}, {}, { sort: { timestamp: -1 } })
    ]);

    const interactionsByType: Record<string, number> = {};
    typeResults.forEach(result => {
      interactionsByType[result._id] = result.count;
    });

    const hours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const averagePerHour = totalResult / hours;

    return {
      totalInteractions: totalResult,
      interactionsByType,
      averagePerHour,
      lastIngestionTime: lastInteraction?.timestamp || null
    };
  }
}

export default new DataIngestionService(); 