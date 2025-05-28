/**
 * ModelServingService.ts
 * Service for model versioning, deployment, caching, and serving for the recommendation system
 */

import mongoose from 'mongoose';
import RecommendationEngine from './RecommendationEngine';
import FeatureEngineeringService from './FeatureEngineeringService';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

// Model version interface
interface ModelVersion {
  id: string;
  name: string;
  version: string;
  algorithm: 'collaborative' | 'content-based' | 'hybrid' | 'popularity' | 'discovery' | 'social';
  config: Record<string, any>;
  performance: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    auc?: number;
    clickThroughRate?: number;
    conversionRate?: number;
  };
  status: 'training' | 'testing' | 'deployed' | 'deprecated';
  deployedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// A/B test configuration
interface ABTestConfig {
  id: string;
  name: string;
  description: string;
  modelVersions: Array<{
    modelId: string;
    trafficPercentage: number;
    name: string;
  }>;
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'running' | 'completed' | 'paused';
  metrics: string[];
  targetUsers?: {
    criteria: Record<string, any>;
    percentage?: number;
  };
}

// Cache entry interface
interface CacheEntry {
  key: string;
  data: any;
  timestamp: Date;
  ttl: number;
  hits: number;
  lastAccessed: Date;
}

// Request context for serving
interface ServingContext {
  userId: mongoose.Types.ObjectId;
  requestId: string;
  timestamp: Date;
  deviceType?: string;
  location?: string;
  sessionId?: string;
  abTestGroup?: string;
  modelVersion?: string;
}

class ModelServingService extends EventEmitter {
  private readonly CACHE_TTL_DEFAULT = 60 * 60 * 1000; // 1 hour
  private readonly CACHE_MAX_SIZE = 10000;
  private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  private readonly RATE_LIMIT_MAX_REQUESTS = 100;

  private modelVersions = new Map<string, ModelVersion>();
  private abTests = new Map<string, ABTestConfig>();
  private cache = new Map<string, CacheEntry>();
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  private currentDeployedModel: string | null = null;

  constructor() {
    super();
    this.initializeDefaultModels();
    this.setupPeriodicTasks();
  }

  /**
   * Serve recommendations with model versioning and caching
   * @param context Serving context
   * @param options Recommendation options
   * @returns Recommendations with metadata
   */
  async serveRecommendations(
    context: ServingContext,
    options: {
      limit?: number;
      algorithm?: string;
      excludeCoffeeIds?: string[];
      includeReasons?: boolean;
      useCache?: boolean;
    } = {}
  ): Promise<{
    recommendations: any[];
    metadata: {
      modelVersion: string;
      algorithm: string;
      cached: boolean;
      processingTime: number;
      abTestGroup?: string;
      requestId: string;
    };
  }> {
    const startTime = Date.now();
    const { useCache = true } = options;

    // Rate limiting check
    if (!this.checkRateLimit(context.userId.toString())) {
      throw new Error('Rate limit exceeded');
    }

    // Determine model version (A/B testing or default)
    const modelVersion = await this.selectModelVersion(context);
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(context.userId, options, modelVersion);
    
    // Check cache first
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp.getTime() < cached.ttl) {
        cached.hits++;
        cached.lastAccessed = new Date();
        
        this.emit('cacheHit', { userId: context.userId, cacheKey, modelVersion });
        
        return {
          recommendations: cached.data,
          metadata: {
            modelVersion,
            algorithm: options.algorithm || 'hybrid',
            cached: true,
            processingTime: Date.now() - startTime,
            abTestGroup: context.abTestGroup,
            requestId: context.requestId
          }
        };
      } else {
        // Remove expired cache entry
        this.cache.delete(cacheKey);
      }
    }

    // Get model configuration
    const model = this.modelVersions.get(modelVersion);
    if (!model) {
      throw new Error(`Model version ${modelVersion} not found`);
    }

    // Generate recommendations using the specified model
    const algorithm = options.algorithm || model.algorithm;
    const recommendations = await RecommendationEngine.generateRecommendations(
      context.userId.toString(),
      {
        ...options,
        algorithm: algorithm as any,
        context: {
          source: 'model-serving',
          deviceType: context.deviceType,
          location: context.location
        }
      }
    );

    // Cache the results
    if (useCache) {
      this.cacheRecommendations(cacheKey, recommendations, this.CACHE_TTL_DEFAULT);
    }

    // Record serving metrics
    this.recordServingMetrics(context, modelVersion, algorithm, recommendations.length);

    this.emit('recommendationsServed', {
      userId: context.userId,
      modelVersion,
      algorithm,
      count: recommendations.length,
      processingTime: Date.now() - startTime
    });

    return {
      recommendations,
      metadata: {
        modelVersion,
        algorithm,
        cached: false,
        processingTime: Date.now() - startTime,
        abTestGroup: context.abTestGroup,
        requestId: context.requestId
      }
    };
  }

  /**
   * Deploy a new model version
   * @param modelConfig Model configuration
   * @returns Deployment result
   */
  async deployModel(modelConfig: {
    name: string;
    version: string;
    algorithm: ModelVersion['algorithm'];
    config: Record<string, any>;
    replaceCurrentDeployment?: boolean;
  }): Promise<{
    success: boolean;
    modelId: string;
    message: string;
  }> {
    try {
      const modelId = `${modelConfig.name}_${modelConfig.version}_${Date.now()}`;
      
      const newModel: ModelVersion = {
        id: modelId,
        name: modelConfig.name,
        version: modelConfig.version,
        algorithm: modelConfig.algorithm,
        config: modelConfig.config,
        performance: {},
        status: 'testing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate model configuration
      const validationResult = await this.validateModelConfig(newModel);
      if (!validationResult.isValid) {
        return {
          success: false,
          modelId,
          message: `Model validation failed: ${validationResult.errors.join(', ')}`
        };
      }

      // Store model version
      this.modelVersions.set(modelId, newModel);

      // Run initial performance tests
      const performanceResults = await this.runPerformanceTests(modelId);
      newModel.performance = performanceResults;
      newModel.status = 'deployed';
      newModel.deployedAt = new Date();

      // Replace current deployment if requested
      if (modelConfig.replaceCurrentDeployment) {
        this.currentDeployedModel = modelId;
        this.clearCache(); // Clear cache when deploying new model
      }

      this.emit('modelDeployed', { modelId, name: modelConfig.name, version: modelConfig.version });

      logger.info(`Model deployed successfully: ${modelId}`);

      return {
        success: true,
        modelId,
        message: 'Model deployed successfully'
      };

    } catch (error) {
      logger.error('Error deploying model:', error);
      return {
        success: false,
        modelId: '',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create and start an A/B test
   * @param testConfig A/B test configuration
   * @returns Test creation result
   */
  async createABTest(testConfig: {
    name: string;
    description: string;
    modelVersions: Array<{ modelId: string; trafficPercentage: number; name: string }>;
    duration: number; // days
    metrics: string[];
    targetUsers?: { criteria: Record<string, any>; percentage?: number };
  }): Promise<{
    success: boolean;
    testId: string;
    message: string;
  }> {
    try {
      // Validate traffic percentages sum to 100
      const totalTraffic = testConfig.modelVersions.reduce((sum, mv) => sum + mv.trafficPercentage, 0);
      if (Math.abs(totalTraffic - 100) > 0.01) {
        return {
          success: false,
          testId: '',
          message: 'Traffic percentages must sum to 100%'
        };
      }

      // Validate model versions exist
      for (const mv of testConfig.modelVersions) {
        if (!this.modelVersions.has(mv.modelId)) {
          return {
            success: false,
            testId: '',
            message: `Model version ${mv.modelId} not found`
          };
        }
      }

      const testId = `ab_test_${Date.now()}`;
      const abTest: ABTestConfig = {
        id: testId,
        name: testConfig.name,
        description: testConfig.description,
        modelVersions: testConfig.modelVersions,
        startDate: new Date(),
        endDate: new Date(Date.now() + testConfig.duration * 24 * 60 * 60 * 1000),
        status: 'running',
        metrics: testConfig.metrics,
        targetUsers: testConfig.targetUsers
      };

      this.abTests.set(testId, abTest);

      this.emit('abTestStarted', { testId, name: testConfig.name });

      logger.info(`A/B test started: ${testId}`);

      return {
        success: true,
        testId,
        message: 'A/B test created and started successfully'
      };

    } catch (error) {
      logger.error('Error creating A/B test:', error);
      return {
        success: false,
        testId: '',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Select model version based on A/B testing or default deployment
   * @private
   */
  private async selectModelVersion(context: ServingContext): Promise<string> {
    // Check if user is part of any active A/B tests
    for (const [testId, test] of this.abTests.entries()) {
      if (test.status === 'running' && this.isUserInTest(context.userId, test)) {
        const selectedModel = this.selectModelFromTest(context.userId, test);
        context.abTestGroup = `${testId}_${selectedModel}`;
        return selectedModel;
      }
    }

    // Return current deployed model or default
    return this.currentDeployedModel || 'default_hybrid_v1';
  }

  /**
   * Check if user is eligible for A/B test
   * @private
   */
  private isUserInTest(userId: mongoose.Types.ObjectId, test: ABTestConfig): boolean {
    // Simple hash-based assignment for consistent user experience
    const userHash = this.hashUserId(userId.toString());
    const testPercentage = test.targetUsers?.percentage || 100;
    return (userHash % 100) < testPercentage;
  }

  /**
   * Select model from A/B test based on traffic allocation
   * @private
   */
  private selectModelFromTest(userId: mongoose.Types.ObjectId, test: ABTestConfig): string {
    const userHash = this.hashUserId(userId.toString());
    const bucket = userHash % 100;
    
    let cumulativePercentage = 0;
    for (const modelVersion of test.modelVersions) {
      cumulativePercentage += modelVersion.trafficPercentage;
      if (bucket < cumulativePercentage) {
        return modelVersion.modelId;
      }
    }
    
    // Fallback to first model
    return test.modelVersions[0].modelId;
  }

  /**
   * Generate cache key for recommendations
   * @private
   */
  private generateCacheKey(
    userId: mongoose.Types.ObjectId,
    options: any,
    modelVersion: string
  ): string {
    const keyParts = [
      userId.toString(),
      modelVersion,
      options.algorithm || 'hybrid',
      options.limit || 10,
      (options.excludeCoffeeIds || []).sort().join(',')
    ];
    return `rec_${keyParts.join('_')}`;
  }

  /**
   * Cache recommendations
   * @private
   */
  private cacheRecommendations(key: string, data: any, ttl: number): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.CACHE_MAX_SIZE) {
      const oldestKey = Array.from(this.cache.entries())
        .sort(([,a], [,b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime())[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      key,
      data,
      timestamp: new Date(),
      ttl,
      hits: 0,
      lastAccessed: new Date()
    });
  }

  /**
   * Check rate limiting
   * @private
   */
  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = this.rateLimitMap.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      this.rateLimitMap.set(userId, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW
      });
      return true;
    }

    if (userLimit.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    userLimit.count++;
    return true;
  }

  /**
   * Hash user ID for consistent A/B test assignment
   * @private
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Validate model configuration
   * @private
   */
  private async validateModelConfig(model: ModelVersion): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    if (!model.name) errors.push('Model name is required');
    if (!model.version) errors.push('Model version is required');
    if (!model.algorithm) errors.push('Model algorithm is required');

    const validAlgorithms = ['collaborative', 'content-based', 'hybrid', 'popularity', 'discovery', 'social'];
    if (!validAlgorithms.includes(model.algorithm)) {
      errors.push(`Invalid algorithm: ${model.algorithm}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Run performance tests on a model
   * @private
   */
  private async runPerformanceTests(modelId: string): Promise<ModelVersion['performance']> {
    // Simplified performance testing - would need actual test data
    return {
      accuracy: 0.85,
      precision: 0.82,
      recall: 0.78,
      f1Score: 0.80,
      clickThroughRate: 0.15,
      conversionRate: 0.05
    };
  }

  /**
   * Record serving metrics
   * @private
   */
  private recordServingMetrics(
    context: ServingContext,
    modelVersion: string,
    algorithm: string,
    recommendationCount: number
  ): void {
    // Emit metrics for external monitoring systems
    this.emit('servingMetrics', {
      userId: context.userId,
      modelVersion,
      algorithm,
      recommendationCount,
      timestamp: context.timestamp,
      deviceType: context.deviceType,
      location: context.location
    });
  }

  /**
   * Initialize default models
   * @private
   */
  private initializeDefaultModels(): void {
    const defaultModel: ModelVersion = {
      id: 'default_hybrid_v1',
      name: 'Default Hybrid',
      version: '1.0.0',
      algorithm: 'hybrid',
      config: {
        weights: {
          collaborative: 0.4,
          contentBased: 0.3,
          popularity: 0.2,
          diversity: 0.1
        }
      },
      performance: {
        accuracy: 0.80,
        precision: 0.75,
        recall: 0.70,
        f1Score: 0.72
      },
      status: 'deployed',
      deployedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.modelVersions.set(defaultModel.id, defaultModel);
    this.currentDeployedModel = defaultModel.id;
  }

  /**
   * Setup periodic maintenance tasks
   * @private
   */
  private setupPeriodicTasks(): void {
    // Clean up expired cache entries every 10 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp.getTime() > entry.ttl) {
          this.cache.delete(key);
        }
      }
    }, 10 * 60 * 1000);

    // Clean up rate limit entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [userId, limit] of this.rateLimitMap.entries()) {
        if (now > limit.resetTime) {
          this.rateLimitMap.delete(userId);
        }
      }
    }, 60 * 1000);

    logger.info('Model serving service initialized with periodic tasks');
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
    this.emit('cacheCleared');
    logger.info('Model serving cache cleared');
  }

  /**
   * Get serving statistics
   * @returns Statistics about model serving
   */
  getServingStats(): {
    modelVersions: number;
    activeABTests: number;
    cacheSize: number;
    cacheHitRate: number;
    currentModel: string | null;
  } {
    const totalHits = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.hits, 0);
    const cacheHitRate = this.cache.size > 0 ? totalHits / this.cache.size : 0;

    return {
      modelVersions: this.modelVersions.size,
      activeABTests: Array.from(this.abTests.values()).filter(test => test.status === 'running').length,
      cacheSize: this.cache.size,
      cacheHitRate,
      currentModel: this.currentDeployedModel
    };
  }

  /**
   * Get model version details
   * @param modelId Model ID
   * @returns Model version details
   */
  getModelVersion(modelId: string): ModelVersion | null {
    return this.modelVersions.get(modelId) || null;
  }

  /**
   * List all model versions
   * @returns Array of model versions
   */
  listModelVersions(): ModelVersion[] {
    return Array.from(this.modelVersions.values());
  }

  /**
   * Get A/B test details
   * @param testId Test ID
   * @returns A/B test configuration
   */
  getABTest(testId: string): ABTestConfig | null {
    return this.abTests.get(testId) || null;
  }

  /**
   * List all A/B tests
   * @returns Array of A/B test configurations
   */
  listABTests(): ABTestConfig[] {
    return Array.from(this.abTests.values());
  }
}

export default new ModelServingService(); 