/**
 * TasteProfileMiddleware
 * Middleware for detecting rating events and triggering taste profile updates
 */

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import TasteProfileUpdateService from '../services/taste-profile-update.service';
import logger from '../utils/logger';

// Extend Express Request to include rating data
interface TasteProfileRequest extends Request {
  rating?: {
    id: string;
    userId: string;
    [key: string]: any;
  };
}

// Helper function to safely get user ID
const getUserId = (user: any): string | undefined => {
  if (!user) return undefined;
  return user.id || user._id?.toString();
};

/**
 * Middleware to trigger taste profile update after rating creation
 */
export const afterRatingCreated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req.user);

    if (!userId) {
      logger.warn('No user found in request for taste profile update');
      return next();
    }

    // Trigger update asynchronously (don't block the response)
    setImmediate(async () => {
      try {
        await TasteProfileUpdateService.triggerUpdate(
          userId,
          'rating_added',
          req.body?.ratingId || req.params?.id,
          {
            source: 'rating_created',
            ratingData: req.body,
          }
        );
        logger.debug(`Taste profile update triggered for user ${userId} after rating creation`);
      } catch (error) {
        logger.error('Error triggering taste profile update after rating creation:', error);
      }
    });

    next();
  } catch (error) {
    logger.error('Error in afterRatingCreated middleware:', error);
    next(); // Continue even if update fails
  }
};

/**
 * Middleware to trigger taste profile update after rating update
 */
export const afterRatingUpdated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req.user);

    if (!userId) {
      logger.warn('No user found in request for taste profile update');
      return next();
    }

    // Trigger update asynchronously
    setImmediate(async () => {
      try {
        await TasteProfileUpdateService.triggerUpdate(
          userId,
          'rating_updated',
          req.params?.id || req.params?.ratingId,
          {
            source: 'rating_updated',
            ratingData: req.body,
          }
        );
        logger.debug(`Taste profile update triggered for user ${userId} after rating update`);
      } catch (error) {
        logger.error('Error triggering taste profile update after rating update:', error);
      }
    });

    next();
  } catch (error) {
    logger.error('Error in afterRatingUpdated middleware:', error);
    next();
  }
};

/**
 * Middleware to trigger taste profile update after rating deletion
 */
export const afterRatingDeleted = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req.user);

    if (!userId) {
      logger.warn('No user found in request for taste profile update');
      return next();
    }

    // Trigger update asynchronously
    setImmediate(async () => {
      try {
        await TasteProfileUpdateService.triggerUpdate(
          userId,
          'rating_deleted',
          req.params?.id || req.params?.ratingId,
          {
            source: 'rating_deleted',
          }
        );
        logger.debug(`Taste profile update triggered for user ${userId} after rating deletion`);
      } catch (error) {
        logger.error('Error triggering taste profile update after rating deletion:', error);
      }
    });

    next();
  } catch (error) {
    logger.error('Error in afterRatingDeleted middleware:', error);
    next();
  }
};

/**
 * Middleware to attach rating data to request for use by other middleware
 */
export const attachRatingData = (ratingData: any) => {
  return (req: TasteProfileRequest, res: Response, next: NextFunction) => {
    const userId = getUserId(req.user);

    req.rating = {
      id: ratingData.id || ratingData._id?.toString(),
      userId: ratingData.userId?.toString() || userId,
      ...ratingData,
    };
    next();
  };
};

/**
 * Middleware to handle bulk rating operations
 */
export const afterBulkRatingOperation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userIds, operation } = req.body;

    if (!userIds || !Array.isArray(userIds)) {
      return next();
    }

    // Trigger updates for all affected users
    setImmediate(async () => {
      try {
        const updatePromises = userIds.map((userId: string) =>
          TasteProfileUpdateService.triggerUpdate(userId, 'manual', undefined, {
            source: 'bulk_operation',
            operation,
          })
        );

        await Promise.allSettled(updatePromises);
        logger.info(
          `Triggered taste profile updates for ${userIds.length} users after bulk operation`
        );
      } catch (error) {
        logger.error(`Error triggering profile updates after bulk operation: ${error}`);
      }
    });

    next();
  } catch (error) {
    logger.error(`Error in afterBulkRatingOperation middleware: ${error}`);
    next();
  }
};

/**
 * Middleware to check if profile update is needed based on request context
 */
export const checkProfileUpdateNeeded = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req.user);

    if (!userId) {
      return next();
    }

    // Check if user has a recent profile
    const queueStatus = TasteProfileUpdateService.getQueueStatus();
    const isQueued = queueStatus.queueDetails.some((q) => q.userId === userId);

    if (isQueued) {
      logger.debug(`User ${userId} already has pending profile update`);
      return next();
    }

    // Add user context for potential update triggers
    if (req.user && typeof req.user === 'object') {
      (req.user as any).profileUpdateContext = {
        lastChecked: new Date(),
        endpoint: req.path,
        method: req.method,
      };
    }

    next();
  } catch (error) {
    logger.error(`Error in checkProfileUpdateNeeded middleware: ${error}`);
    next();
  }
};

/**
 * Error handling middleware for profile update operations
 */
export const handleProfileUpdateErrors = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = getUserId(req.user);
  const rating = (req as TasteProfileRequest).rating;

  if (error.name === 'ProfileUpdateError') {
    logger.error(`Profile update error: ${error.message}`, {
      userId,
      ratingId: rating?.id,
      stack: error.stack,
    });

    // Don't fail the main request due to profile update errors
    return next();
  }

  next(error);
};
