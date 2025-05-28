/**
 * dataCollection.controller.ts
 * Handles routes related to tracking user interactions and gathering analytics data
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { UserInteraction } from '../models/recommendation.model';
import logger from '../utils/logger';

/**
 * Track a single user interaction with coffee or app features
 */
export const trackInteraction = async (req: Request, res: Response) => {
  try {
    const { userId, coffeeId, interactionType, value, metadata } = req.body;

    if (!userId || !interactionType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId and interactionType are required',
      });
    }

    // Create user interaction document
    const interaction = new UserInteraction({
      userId: new mongoose.Types.ObjectId(userId),
      coffeeId: coffeeId ? new mongoose.Types.ObjectId(coffeeId) : undefined,
      interactionType,
      value,
      metadata,
      timestamp: new Date(),
    });

    // Save interaction to database
    await interaction.save();

    logger.info(`Tracked interaction: ${interactionType} for user: ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Interaction tracked successfully',
      data: interaction,
    });
  } catch (error) {
    logger.error('Error tracking interaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track interaction',
      error: error.message,
    });
  }
};

/**
 * Track multiple user interactions in a single request (batch processing)
 */
export const batchTrackInteractions = async (req: Request, res: Response) => {
  try {
    const { interactions } = req.body;

    if (!interactions || !Array.isArray(interactions) || interactions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid interactions array',
      });
    }

    // Prepare interaction documents
    const interactionDocs = interactions.map((interaction) => ({
      userId: new mongoose.Types.ObjectId(interaction.userId),
      coffeeId: interaction.coffeeId
        ? new mongoose.Types.ObjectId(interaction.coffeeId)
        : undefined,
      interactionType: interaction.interactionType,
      value: interaction.value,
      metadata: interaction.metadata,
      timestamp: new Date(),
    }));

    // Insert all interactions at once
    const result = await UserInteraction.insertMany(interactionDocs);

    logger.info(`Batch tracked ${result.length} interactions`);

    res.status(201).json({
      success: true,
      message: `${result.length} interactions tracked successfully`,
    });
  } catch (error) {
    logger.error('Error batch tracking interactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to batch track interactions',
      error: error.message,
    });
  }
};

/**
 * Get statistics about a coffee item's interactions
 */
export const getCoffeeStats = async (req: Request, res: Response) => {
  try {
    const { coffeeId } = req.params;

    if (!coffeeId) {
      return res.status(400).json({
        success: false,
        message: 'Coffee ID is required',
      });
    }

    // Aggregate interaction statistics
    const stats = await UserInteraction.aggregate([
      {
        $match: {
          coffeeId: new mongoose.Types.ObjectId(coffeeId),
        },
      },
      {
        $group: {
          _id: '$interactionType',
          count: { $sum: 1 },
          averageValue: { $avg: '$value' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: 'Coffee statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting coffee stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get coffee statistics',
      error: error.message,
    });
  }
};

/**
 * Get user's interaction history
 */
export const getUserHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0, type } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    // Build query
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    // Add interaction type filter if specified
    if (type) {
      query.interactionType = type;
    }

    // Get interaction history
    const history = await UserInteraction.find(query)
      .sort({ timestamp: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('coffeeId', 'name roaster origin roastLevel')
      .lean();

    const total = await UserInteraction.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'User history retrieved successfully',
      data: {
        history,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: total > Number(offset) + Number(limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error getting user history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user history',
      error: error.message,
    });
  }
};

/**
 * Track user feedback for recommendations
 */
export const trackFeedback = async (req: Request, res: Response) => {
  try {
    const { userId, recommendationId, feedback } = req.body;

    if (!userId || !recommendationId || !feedback) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, recommendationId, and feedback are required',
      });
    }

    // Create interaction for the feedback
    const interaction = new UserInteraction({
      userId: new mongoose.Types.ObjectId(userId),
      coffeeId: new mongoose.Types.ObjectId(feedback.coffeeId),
      interactionType: 'recommendation_feedback',
      value: feedback.accepted ? 1 : feedback.rejected ? -1 : 0,
      metadata: {
        recommendationId,
        interacted: feedback.interacted,
        accepted: feedback.accepted,
        rejected: feedback.rejected,
        feedbackType: feedback.feedbackType,
        reason: feedback.reason,
      },
      timestamp: new Date(),
    });

    await interaction.save();

    logger.info(
      `Tracked recommendation feedback for user: ${userId}, recommendation: ${recommendationId}`
    );

    res.status(201).json({
      success: true,
      message: 'Feedback tracked successfully',
      data: interaction,
    });
  } catch (error) {
    logger.error('Error tracking feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track feedback',
      error: error.message,
    });
  }
};
