/**
 * TasteProfileUpdateService
 * Handles real-time and batch updates to user taste profiles
 * Provides efficient partial updates, debouncing, and consistency management
 */

import mongoose from 'mongoose';
import TasteProfile, { ITasteProfileDocument, CoffeeAttribute } from '../models/taste-profile.model';
import Rating, { IRatingDocument } from '../models/rating.model';
import TasteProfileAggregationService from './taste-profile-aggregation.service';
import logger from '../utils/logger';

interface UpdateTrigger {
  userId: string;
  triggerType: 'rating_added' | 'rating_updated' | 'rating_deleted' | 'manual' | 'scheduled';
  ratingId?: string;
  metadata?: any;
  timestamp: Date;
}

interface UpdateQueue {
  triggers: UpdateTrigger[];
  scheduledAt: Date;
  priority: 'high' | 'medium' | 'low';
}

interface UpdateConfiguration {
  debounceTime?: number;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableRealTimeUpdates?: boolean;
  enableBatchUpdates?: boolean;
}

class TasteProfileUpdateService {
  private static updateQueue: Map<string, UpdateTrigger> = new Map();
  private static config: UpdateConfiguration = {
    debounceTime: 5000, // 5 seconds
    batchSize: 10,
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    enableRealTimeUpdates: true,
    enableBatchUpdates: true
  };
  private static updateHistory: Map<string, any[]> = new Map();
  private static processingUsers: Set<string> = new Set();
  private static debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  // Configuration constants
  private static readonly MIN_RATINGS_FOR_UPDATE = 3;
  private static readonly SIGNIFICANCE_THRESHOLD = 0.1; // 10% change threshold

  /**
   * Trigger a taste profile update for a user
   */
  static async triggerUpdate(
    userId: string,
    triggerType: UpdateTrigger['triggerType'],
    ratingId?: string,
    metadata?: any
  ): Promise<{ queued: boolean; immediate: boolean; reason: string }> {
    try {
      if (!this.config.enableRealTimeUpdates && triggerType !== 'manual') {
        return { queued: false, immediate: false, reason: 'Real-time updates disabled' };
      }

      const trigger: UpdateTrigger = {
        userId,
        triggerType,
        ratingId,
        metadata,
        timestamp: new Date()
      };

      // For manual triggers or deletions, process immediately
      if (triggerType === 'manual' || triggerType === 'rating_deleted') {
        await this.executeUpdate(userId, trigger);
        return { queued: false, immediate: true, reason: 'Processed immediately' };
      }

      // For other triggers, use debouncing
      this.queueUpdate(userId, trigger);
      return { queued: true, immediate: false, reason: 'Queued for debounced processing' };

    } catch (error) {
      logger.error(`Error triggering update for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Queue an update with debouncing
   */
  private static queueUpdate(userId: string, trigger: UpdateTrigger): void {
    // Clear existing timer if any
    const existingTimer = this.debounceTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Store the trigger (overwrites previous for same user)
    this.updateQueue.set(userId, trigger);

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.processUserUpdate(userId);
    }, this.config.debounceTime);

    this.debounceTimers.set(userId, timer);
  }

  /**
   * Process a queued update for a user
   */
  private static async processUserUpdate(userId: string): Promise<void> {
    try {
      if (this.processingUsers.has(userId)) {
        logger.debug(`Update already in progress for user ${userId}`);
        return;
      }

      const trigger = this.updateQueue.get(userId);
      if (!trigger) {
        logger.debug(`No queued update found for user ${userId}`);
        return;
      }

      this.processingUsers.add(userId);
      this.updateQueue.delete(userId);
      this.debounceTimers.delete(userId);

      await this.executeUpdate(userId, trigger);

    } catch (error) {
      logger.error(`Error processing update for user ${userId}:`, error);
    } finally {
      this.processingUsers.delete(userId);
    }
  }

  /**
   * Execute a profile update for a user
   */
  private static async executeUpdate(userId: string, trigger: UpdateTrigger): Promise<any> {
    try {
      logger.info(`Executing profile update for user ${userId}`, { trigger });

      // Get current profile and recent ratings
      const currentProfile = await TasteProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
      const recentRatings = await Rating.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(100);

      // Determine update type
      const updateType = await this.determineUpdateType(userId, currentProfile, recentRatings);

      let result;
      if (updateType === 'full') {
        // Use aggregation service for full update
        result = await TasteProfileAggregationService.generateTasteProfile(userId);
      } else if (updateType === 'partial') {
        // Perform partial update
        result = await this.performPartialUpdate(currentProfile!, recentRatings);
      } else {
        // Skipped update
        result = { skipped: true, reason: 'No significant changes detected' };
      }

      // Record in history
      const historyEntry = {
        timestamp: new Date(),
        trigger,
        updateType,
        result: result ? 'success' : 'failed',
        details: result
      };

      const userHistory = this.updateHistory.get(userId) || [];
      userHistory.push(historyEntry);
      
      // Keep only last 50 entries per user
      if (userHistory.length > 50) {
        userHistory.shift();
      }
      
      this.updateHistory.set(userId, userHistory);

      logger.info(`Profile update completed for user ${userId}`, { updateType, result });
      return result;

    } catch (error) {
      logger.error(`Error executing profile update for user ${userId}:`, error);
      
      // Record failed attempt in history
      const historyEntry = {
        timestamp: new Date(),
        trigger,
        updateType: 'failed',
        result: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      const userHistory = this.updateHistory.get(userId) || [];
      userHistory.push(historyEntry);
      this.updateHistory.set(userId, userHistory);

      throw error;
    }
  }

  /**
   * Determine the type of update needed
   */
  private static async determineUpdateType(
    userId: string,
    currentProfile: ITasteProfileDocument | null,
    recentRatings: IRatingDocument[]
  ): Promise<'full' | 'partial' | 'skipped'> {
    if (!currentProfile) {
      return 'full';
    }

    // Check if enough new ratings to warrant update
    const lastUpdate = currentProfile.lastCalculated;
    const newRatings = recentRatings.filter(r => r.createdAt > lastUpdate);
    
    if (newRatings.length === 0) {
      return 'skipped';
    }

    // If many new ratings or profile is old, do full update
    const ratingsRatio = newRatings.length / currentProfile.totalRatings;
    const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);

    if (ratingsRatio > 0.2 || hoursSinceUpdate > 168) { // 20% new ratings or 1 week old
      return 'full';
    }

    return 'partial';
  }

  /**
   * Perform a partial update to the profile
   */
  private static async performPartialUpdate(
    currentProfile: ITasteProfileDocument,
    newRatings: IRatingDocument[]
  ): Promise<ITasteProfileDocument> {
    try {
      // Calculate incremental changes
      const newRatingsCount = newRatings.length;
      const totalRatings = currentProfile.totalRatings + newRatingsCount;

      // Update rating patterns
      const newAverageRating = this.calculateNewAverage(
        currentProfile.ratingPatterns.averageOverallRating,
        currentProfile.totalRatings,
        newRatings
      );

      // Update the profile with incremental changes
      const updatedProfile = await TasteProfile.findByIdAndUpdate(
        currentProfile._id,
        {
          $set: {
            totalRatings: totalRatings,
            lastRatingDate: newRatings[0]?.createdAt || currentProfile.lastRatingDate,
            lastCalculated: new Date(),
            'ratingPatterns.averageOverallRating': newAverageRating
          }
        },
        { new: true }
      );

      logger.info(`Partial update completed for profile ${currentProfile._id}`);
      return updatedProfile!;

    } catch (error) {
      logger.error('Error performing partial update:', error);
      throw error;
    }
  }

  /**
   * Calculate new average rating with incremental data
   */
  private static calculateNewAverage(
    currentAverage: number,
    currentCount: number,
    newRatings: IRatingDocument[]
  ): number {
    if (newRatings.length === 0) return currentAverage;
    
    const newRatingsSum = newRatings.reduce((sum, rating) => sum + rating.overall, 0);
    const totalSum = (currentAverage * currentCount) + newRatingsSum;
    const totalCount = currentCount + newRatings.length;
    
    return totalSum / totalCount;
  }

  /**
   * Get queue status and statistics
   */
  static getQueueStatus(): {
    queueSize: number;
    processingCount: number;
    queueDetails: any[];
    configuration: UpdateConfiguration;
  } {
    const queueDetails = Array.from(this.updateQueue.entries()).map(([userId, trigger]) => ({
      userId,
      triggerType: trigger.triggerType,
      scheduledAt: trigger.timestamp,
      ratingId: trigger.ratingId
    }));

    return {
      queueSize: this.updateQueue.size,
      processingCount: this.processingUsers.size,
      queueDetails,
      configuration: { ...this.config }
    };
  }

  /**
   * Get current configuration
   */
  static getConfiguration(): UpdateConfiguration {
    return { ...this.config };
  }

  /**
   * Update configuration settings
   */
  static updateConfiguration(newConfig: Partial<UpdateConfiguration>): UpdateConfiguration {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    logger.info('Taste profile update configuration updated', newConfig);
    return { ...this.config };
  }

  /**
   * Force process all pending updates
   */
  static async processPendingUpdates(): Promise<{
    processed: number;
    failed: number;
    results: any[];
  }> {
    const results: any[] = [];
    let processed = 0;
    let failed = 0;

    // Process all queued updates
    const queueEntries = Array.from(this.updateQueue.entries());
    
    for (const [userId, trigger] of queueEntries) {
      try {
        const result = await this.executeUpdate(userId, trigger);
        results.push({ userId, success: true, result });
        processed++;
        
        // Remove from queue after successful processing
        this.updateQueue.delete(userId);
      } catch (error) {
        results.push({ 
          userId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        failed++;
        logger.error(`Failed to process update for user ${userId}:`, error);
      }
    }

    logger.info(`Processed ${processed} updates, ${failed} failed`);
    
    return {
      processed,
      failed,
      results
    };
  }

  /**
   * Get update history for a user
   */
  static getUpdateHistory(
    userId: string, 
    limit: number = 10, 
    offset: number = 0
  ): {
    updates: any[];
    total: number;
    hasMore: boolean;
  } {
    const userHistory = this.updateHistory.get(userId) || [];
    const total = userHistory.length;
    const updates = userHistory
      .slice(offset, offset + limit)
      .reverse(); // Most recent first

    return {
      updates,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Clear all queued updates (for testing/admin purposes)
   */
  static clearQueue(): void {
    this.updateQueue.clear();
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.processingUsers.clear();
    logger.info('Update queue cleared');
  }

  /**
   * Get service statistics
   */
  static getStatistics(): {
    totalUpdatesProcessed: number;
    averageProcessingTime: number;
    errorRate: number;
    activeUsers: number;
  } {
    let totalUpdates = 0;
    let totalErrors = 0;

    this.updateHistory.forEach(history => {
      totalUpdates += history.length;
      totalErrors += history.filter(entry => entry.result === 'error').length;
    });

    return {
      totalUpdatesProcessed: totalUpdates,
      averageProcessingTime: 0, // TODO: Implement timing tracking
      errorRate: totalUpdates > 0 ? (totalErrors / totalUpdates) * 100 : 0,
      activeUsers: this.updateHistory.size
    };
  }
}

export default TasteProfileUpdateService; 