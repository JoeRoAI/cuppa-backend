/**
 * recommendation.controller.ts
 * Handles requests for recommendation-related functionality
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import RecommendationEngine from '../services/RecommendationEngine';
import PersonalizationService from '../services/PersonalizationService';
import DataIngestionService from '../services/DataIngestionService';
import FeatureEngineeringService from '../services/FeatureEngineeringService';
import ModelServingService from '../services/ModelServingService';
import MonitoringService from '../services/MonitoringService';
import logger from '../utils/logger';

/**
 * Helper function to extract user ID from request
 * Handles both mock users (id) and real users (_id)
 */
const getUserId = (req: Request): string | null => {
  if (!req.user) return null;
  
  // Handle mock users (have id property)
  if ('id' in req.user && req.user.id) {
    return req.user.id.toString();
  }
  
  // Handle real users (have _id property)
  if ('_id' in req.user && req.user._id) {
    return req.user._id.toString();
  }
  
  return null;
};

/**
 * Get personalized recommendations for the authenticated user
 * @route GET /api/recommendations
 * @access Private
 */
export const getRecommendations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Parse query parameters
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const algorithm =
      (req.query.algorithm as
        | 'collaborative'
        | 'content-based'
        | 'hybrid'
        | 'popularity'
        | 'discovery'
        | 'social') || 'hybrid';
    const includeReasons = req.query.includeReasons === 'true';
    const excludeIds = req.query.exclude ? (req.query.exclude as string).split(',') : [];

    // Get contextual information from request if available
    const context = {
      source: (req.query.source as string) || 'api',
      deviceType:
        (req.query.deviceType as string) || req.headers['user-agent']?.includes('Mobile')
          ? 'mobile'
          : 'desktop',
      timeOfDay: (req.query.timeOfDay as string) || getTimeOfDay(new Date()),
      dayOfWeek: req.query.dayOfWeek
        ? parseInt(req.query.dayOfWeek as string, 10)
        : new Date().getDay(),
      location: (req.query.location as string) || (req.headers['x-user-location'] as string),
    };

    // Get recommendations
    const recommendations = await RecommendationEngine.generateRecommendations(userId, {
      limit,
      algorithm,
      excludeCoffeeIds: excludeIds,
      includeReasons,
      context,
    });

    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations,
    });
  } catch (error) {
    logger.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting recommendations',
    });
  }
};

/**
 * Get user's taste profile
 * @route GET /api/recommendations/profile
 * @access Private
 */
export const getUserTasteProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Generate user model from personalization service
    const userModel = await PersonalizationService.generateUserModel(userId);

    // Extract key insights for the user interface
    const tasteProfile = {
      explicitPreferences: userModel.explicitPreferences,
      lastUpdated: userModel.lastUpdated,
      activeTimePatterns: userModel.activeTimePatterns,
      noveltyPreference: userModel.noveltyPreference,
      topOrigins: userModel.implicitPreferences?.preferredAttributes?.origins?.slice(0, 3) || [],
      topRoastLevels:
        userModel.implicitPreferences?.preferredAttributes?.roastLevels?.slice(0, 3) || [],
      topFlavorNotes:
        userModel.implicitPreferences?.preferredAttributes?.flavorNotes?.slice(0, 5) || [],
    };

    res.status(200).json({
      success: true,
      data: tasteProfile,
    });
  } catch (error) {
    logger.error('Error getting user taste profile:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting taste profile',
    });
  }
};

/**
 * Ingest user interactions in real-time
 * @route POST /api/recommendations/interactions
 * @access Private
 */
export const ingestUserInteractions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    const { interactions } = req.body;
    if (!interactions || !Array.isArray(interactions)) {
      res.status(400).json({
        success: false,
        error: 'Invalid interactions data. Expected array of interactions.',
      });
      return;
    }

    // Process each interaction individually for real-time ingestion
    const results = [];
    for (const interaction of interactions) {
      const interactionData = {
        ...interaction,
        userId: userId,
      };
      
      const result = await DataIngestionService.ingestRealTimeInteraction(interactionData);
      results.push(result);
    }

    res.status(200).json({
      success: true,
      data: {
        processed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      },
    });
  } catch (error) {
    logger.error('Error ingesting user interactions:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while ingesting interactions',
    });
  }
};

/**
 * Batch ingest interactions
 * @route POST /api/recommendations/interactions/batch
 * @access Private
 */
export const batchIngestInteractions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { interactions, batchSize } = req.body;
    if (!interactions || !Array.isArray(interactions)) {
      res.status(400).json({
        success: false,
        error: 'Invalid interactions data. Expected array of interactions.',
      });
      return;
    }

    const result = await DataIngestionService.batchProcessInteractions(interactions, {
      batchSize: batchSize || 1000,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error batch ingesting interactions:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while batch ingesting interactions',
    });
  }
};

/**
 * Get user features
 * @route GET /api/recommendations/features/:userId
 * @access Private
 */
export const getUserFeatures = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    // Check if user is requesting their own features or has admin access
    const requestingUserId = getUserId(req);
    if (userId !== requestingUserId) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Can only access your own features.',
      });
      return;
    }

    const features = await FeatureEngineeringService.extractUserFeatures(new mongoose.Types.ObjectId(userId));

    res.status(200).json({
      success: true,
      data: features,
    });
  } catch (error) {
    logger.error('Error getting user features:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting user features',
    });
  }
};

/**
 * Refresh user features
 * @route POST /api/recommendations/features/:userId/refresh
 * @access Private
 */
export const refreshUserFeatures = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    // Check if user is requesting refresh of their own features
    const requestingUserId = getUserId(req);
    if (userId !== requestingUserId) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Can only refresh your own features.',
      });
      return;
    }

    // Force refresh features (bypass cache)
    const features = await FeatureEngineeringService.extractUserFeatures(new mongoose.Types.ObjectId(userId), true);

    res.status(200).json({
      success: true,
      data: features,
      message: 'User features refreshed successfully',
    });
  } catch (error) {
    logger.error('Error refreshing user features:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while refreshing user features',
    });
  }
};

/**
 * Get model metrics
 * @route GET /api/recommendations/models/metrics
 * @access Private
 */
export const getModelMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = ModelServingService.getServingStats();

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Error getting model metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting model metrics',
    });
  }
};

/**
 * Deploy model version
 * @route POST /api/recommendations/models/deploy
 * @access Private (Admin only in production)
 */
export const deployModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, version, algorithm, config } = req.body;

    if (!name || !version || !algorithm) {
      res.status(400).json({
        success: false,
        error: 'Model name, version, and algorithm are required',
      });
      return;
    }

    const result = await ModelServingService.deployModel({
      name,
      version,
      algorithm,
      config: config || {},
      replaceCurrentDeployment: true
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error deploying model:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deploying model',
    });
  }
};

/**
 * Get A/B test results
 * @route GET /api/recommendations/models/ab-test/:testId
 * @access Private
 */
export const getABTestResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { testId } = req.params;

    const test = ModelServingService.getABTest(testId);
    
    if (!test) {
      res.status(404).json({
        success: false,
        error: 'A/B test not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: test,
    });
  } catch (error) {
    logger.error('Error getting A/B test results:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting A/B test results',
    });
  }
};

/**
 * Get system health status
 * @route GET /api/recommendations/health
 * @access Private
 */
export const getSystemHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get comprehensive health status from monitoring service
    const health = await MonitoringService.getSystemHealth();

    res.status(200).json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error('Error getting system health:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting system health',
    });
  }
};

/**
 * Get performance metrics
 * @route GET /api/recommendations/metrics
 * @access Private
 */
export const getPerformanceMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = {
      dataIngestion: await DataIngestionService.getIngestionStats(),
      featureEngineering: FeatureEngineeringService.getFeatureStats(),
      modelServing: ModelServingService.getServingStats(),
      monitoring: MonitoringService.getMonitoringStats(),
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date(),
      },
    };

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting performance metrics',
    });
  }
};

/**
 * Detect model drift
 * @route POST /api/recommendations/models/drift-detection
 * @access Private
 */
export const detectModelDrift = async (req: Request, res: Response): Promise<void> => {
  try {
    const { modelVersion, algorithm } = req.body;

    if (!modelVersion || !algorithm) {
      res.status(400).json({
        success: false,
        error: 'Model version and algorithm are required',
      });
      return;
    }

    const driftResult = await MonitoringService.detectModelDrift(modelVersion, algorithm);

    res.status(200).json({
      success: true,
      data: driftResult,
    });
  } catch (error) {
    logger.error('Error detecting model drift:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while detecting model drift',
    });
  }
};

/**
 * Set baseline for drift detection
 * @route POST /api/recommendations/models/set-baseline
 * @access Private
 */
export const setModelBaseline = async (req: Request, res: Response): Promise<void> => {
  try {
    const { modelVersion, algorithm } = req.body;

    if (!modelVersion || !algorithm) {
      res.status(400).json({
        success: false,
        error: 'Model version and algorithm are required',
      });
      return;
    }

    MonitoringService.setBaseline(modelVersion, algorithm);

    res.status(200).json({
      success: true,
      message: `Baseline set for ${modelVersion} ${algorithm}`,
    });
  } catch (error) {
    logger.error('Error setting model baseline:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while setting model baseline',
    });
  }
};

/**
 * Get monitoring statistics
 * @route GET /api/recommendations/monitoring/stats
 * @access Private
 */
export const getMonitoringStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = MonitoringService.getMonitoringStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting monitoring stats:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while getting monitoring stats',
    });
  }
};

/**
 * Determine time of day based on hour
 * @private
 */
const getTimeOfDay = (date: Date): string => {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return 'morning';
  } else if (hour >= 12 && hour < 18) {
    return 'afternoon';
  } else if (hour >= 18 && hour < 22) {
    return 'evening';
  } else {
    return 'night';
  }
};
