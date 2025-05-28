/**
 * DiscoveryModeService.ts
 * Advanced discovery mode service implementing exploration-exploitation algorithms
 * for coffee recommendations using multi-armed bandit strategies
 */

import mongoose from 'mongoose';
import { UserInteraction } from '../models/recommendation.model';
import User from '../models/user.model';
import logger from '../utils/logger';

// Internal recommendation type matching RecommendationEngine
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

// Configuration for discovery mode algorithms
const DISCOVERY_CONFIG = {
  // Multi-Armed Bandit parameters
  EPSILON_GREEDY: {
    EPSILON: 0.1, // 10% exploration rate
    DECAY_RATE: 0.995, // Epsilon decay over time
    MIN_EPSILON: 0.05, // Minimum exploration rate
  },
  
  UCB: {
    CONFIDENCE_LEVEL: 2.0, // UCB confidence parameter
    MIN_TRIALS: 5, // Minimum trials before UCB kicks in
  },
  
  THOMPSON_SAMPLING: {
    ALPHA_PRIOR: 1.0, // Beta distribution alpha prior
    BETA_PRIOR: 1.0, // Beta distribution beta prior
  },
  
  // Diversity constraints
  DIVERSITY: {
    MAX_SAME_ORIGIN: 2,
    MAX_SAME_ROAST: 3,
    MAX_SAME_PROCESSING: 2,
    MIN_ATTRIBUTE_DISTANCE: 0.4,
  },
  
  // Learning parameters
  LEARNING: {
    FEEDBACK_WINDOW_DAYS: 30,
    MIN_INTERACTIONS_FOR_LEARNING: 10,
    EXPLORATION_BOOST_FACTOR: 1.5,
  },
  
  // Recommendation limits
  MAX_DISCOVERY_RECOMMENDATIONS: 20,
  MIN_QUALITY_THRESHOLD: 3.0, // Minimum average rating
};

interface BanditArm {
  coffeeId: string;
  trials: number;
  successes: number;
  lastUpdated: Date;
  averageReward: number;
  confidence: number;
  attributes: {
    roastLevel: string;
    origin: string;
    processingMethod: string;
    flavorNotes: string[];
    avgRating: number;
  };
  coffee?: any; // Full coffee object for recommendation creation
}

interface ExplorationMetrics {
  userId: string;
  explorationRate: number;
  diversityScore: number;
  noveltyPreference: number;
  lastUpdated: Date;
  totalDiscoveryInteractions: number;
  successfulDiscoveries: number;
}

class DiscoveryModeService {
  private banditArms: Map<string, BanditArm[]> = new Map(); // userId -> arms
  private explorationMetrics: Map<string, ExplorationMetrics> = new Map();

  /**
   * Generate discovery recommendations using multi-armed bandit algorithms
   */
  async generateDiscoveryRecommendations(
    userId: mongoose.Types.ObjectId,
    excludeCoffeeIds: string[] = [],
    algorithm: 'epsilon-greedy' | 'ucb' | 'thompson-sampling' | 'hybrid' = 'hybrid',
    limit: number = 10
  ): Promise<InternalRecommendation[]> {
    try {
      const userIdString = userId.toString();
      logger.info(`Generating discovery recommendations for user ${userIdString} using ${algorithm}`);
      
      // Initialize or update user's bandit arms
      await this.initializeBanditArms(userIdString, excludeCoffeeIds);
      
      // Get user's exploration metrics
      const metrics = await this.getExplorationMetrics(userIdString);
      
      // Generate recommendations based on selected algorithm
      let recommendations: InternalRecommendation[] = [];
      
      switch (algorithm) {
        case 'epsilon-greedy':
          recommendations = await this.epsilonGreedyRecommendations(userId, metrics, limit);
          break;
        case 'ucb':
          recommendations = await this.ucbRecommendations(userId, metrics, limit);
          break;
        case 'thompson-sampling':
          recommendations = await this.thompsonSamplingRecommendations(userId, metrics, limit);
          break;
        case 'hybrid':
        default:
          recommendations = await this.hybridBanditRecommendations(userId, metrics, limit);
          break;
      }
      
      // Apply diversity constraints
      recommendations = this.applyDiversityConstraints(recommendations);
      
      // Add discovery-specific reasons
      recommendations = this.addDiscoveryReasons(recommendations, algorithm);
      
      logger.info(`Generated ${recommendations.length} discovery recommendations for user ${userIdString}`);
      return recommendations.slice(0, limit);
      
    } catch (error) {
      logger.error('Error generating discovery recommendations:', error);
      return [];
    }
  }

  /**
   * Epsilon-Greedy algorithm implementation
   */
  private async epsilonGreedyRecommendations(
    userId: mongoose.Types.ObjectId,
    metrics: ExplorationMetrics,
    limit: number
  ): Promise<InternalRecommendation[]> {
    const arms = this.banditArms.get(userId.toString()) || [];
    const recommendations: InternalRecommendation[] = [];
    
    // Calculate current epsilon with decay
    const epsilon = Math.max(
      DISCOVERY_CONFIG.EPSILON_GREEDY.MIN_EPSILON,
      DISCOVERY_CONFIG.EPSILON_GREEDY.EPSILON * 
      Math.pow(DISCOVERY_CONFIG.EPSILON_GREEDY.DECAY_RATE, metrics.totalDiscoveryInteractions)
    );
    
    for (let i = 0; i < limit && i < arms.length; i++) {
      let selectedArm: BanditArm;
      
      if (Math.random() < epsilon) {
        // Exploration: select random arm
        const unexploredArms = arms.filter(arm => arm.trials < 3);
        if (unexploredArms.length > 0) {
          selectedArm = unexploredArms[Math.floor(Math.random() * unexploredArms.length)];
        } else {
          selectedArm = arms[Math.floor(Math.random() * arms.length)];
        }
      } else {
        // Exploitation: select best performing arm
        selectedArm = arms.reduce((best, current) => 
          current.averageReward > best.averageReward ? current : best
        );
      }
      
      recommendations.push(this.createRecommendation(userId, selectedArm, 'epsilon-greedy'));
      
      // Remove selected arm to avoid duplicates
      const armIndex = arms.indexOf(selectedArm);
      if (armIndex > -1) {
        arms.splice(armIndex, 1);
      }
    }
    
    return recommendations;
  }

  /**
   * Upper Confidence Bound (UCB) algorithm implementation
   */
  private async ucbRecommendations(
    userId: mongoose.Types.ObjectId,
    metrics: ExplorationMetrics,
    limit: number
  ): Promise<InternalRecommendation[]> {
    const arms = this.banditArms.get(userId.toString()) || [];
    const recommendations: InternalRecommendation[] = [];
    const totalTrials = arms.reduce((sum, arm) => sum + arm.trials, 0);
    
    // Calculate UCB scores for each arm
    const armsWithUCB = arms.map(arm => {
      let ucbScore: number;
      
      if (arm.trials < DISCOVERY_CONFIG.UCB.MIN_TRIALS) {
        // Give high priority to under-explored arms
        ucbScore = Number.MAX_SAFE_INTEGER;
      } else {
        const confidenceTerm = Math.sqrt(
          (DISCOVERY_CONFIG.UCB.CONFIDENCE_LEVEL * Math.log(totalTrials)) / arm.trials
        );
        ucbScore = arm.averageReward + confidenceTerm;
      }
      
      return { arm, ucbScore };
    });
    
    // Sort by UCB score and select top arms
    armsWithUCB.sort((a, b) => b.ucbScore - a.ucbScore);
    
    for (let i = 0; i < limit && i < armsWithUCB.length; i++) {
      const { arm } = armsWithUCB[i];
      recommendations.push(this.createRecommendation(userId, arm, 'ucb'));
    }
    
    return recommendations;
  }

  /**
   * Thompson Sampling algorithm implementation
   */
  private async thompsonSamplingRecommendations(
    userId: mongoose.Types.ObjectId,
    metrics: ExplorationMetrics,
    limit: number
  ): Promise<InternalRecommendation[]> {
    const arms = this.banditArms.get(userId.toString()) || [];
    const recommendations: InternalRecommendation[] = [];
    
    // Calculate Thompson sampling scores for each arm
    const armsWithSamples = arms.map(arm => {
      const alpha = DISCOVERY_CONFIG.THOMPSON_SAMPLING.ALPHA_PRIOR + arm.successes;
      const beta = DISCOVERY_CONFIG.THOMPSON_SAMPLING.BETA_PRIOR + (arm.trials - arm.successes);
      const sample = this.sampleBetaDistribution(alpha, beta);
      
      return { arm, sample };
    });
    
    // Sort by sampled values and select top arms
    armsWithSamples.sort((a, b) => b.sample - a.sample);
    
    for (let i = 0; i < limit && i < armsWithSamples.length; i++) {
      const { arm } = armsWithSamples[i];
      recommendations.push(this.createRecommendation(userId, arm, 'thompson-sampling'));
    }
    
    return recommendations;
  }

  /**
   * Hybrid bandit algorithm combining multiple approaches
   */
  private async hybridBanditRecommendations(
    userId: mongoose.Types.ObjectId,
    metrics: ExplorationMetrics,
    limit: number
  ): Promise<InternalRecommendation[]> {
    const recommendations: InternalRecommendation[] = [];
    
    // Allocate recommendations across algorithms
    const epsilonCount = Math.ceil(limit * 0.4);
    const ucbCount = Math.ceil(limit * 0.3);
    const thompsonCount = limit - epsilonCount - ucbCount;
    
    // Get recommendations from each algorithm
    const epsilonRecs = await this.epsilonGreedyRecommendations(userId, metrics, epsilonCount);
    const ucbRecs = await this.ucbRecommendations(userId, metrics, ucbCount);
    const thompsonRecs = await this.thompsonSamplingRecommendations(userId, metrics, thompsonCount);
    
    // Combine and deduplicate
    recommendations.push(...epsilonRecs, ...ucbRecs, ...thompsonRecs);
    return this.deduplicateRecommendations(recommendations).slice(0, limit);
  }

  /**
   * Initialize bandit arms for a user based on available coffees
   */
  private async initializeBanditArms(userId: string, excludeCoffeeIds: string[]): Promise<void> {
    try {
      const Coffee = mongoose.model('Coffee');
      
      // Get available coffees that meet quality threshold
      const availableCoffees = await Coffee.find({
        _id: { $nin: excludeCoffeeIds.map(id => new mongoose.Types.ObjectId(id)) },
        isActive: true,
        isAvailable: true,
        avgRating: { $gte: DISCOVERY_CONFIG.MIN_QUALITY_THRESHOLD },
      })
        .limit(DISCOVERY_CONFIG.MAX_DISCOVERY_RECOMMENDATIONS * 2)
        .lean();

      // Get user's interaction history for this coffee
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const interactions = await UserInteraction.find({
        userId: userObjectId,
        interactionType: { $in: ['rating', 'purchase', 'favorite'] },
        timestamp: { 
          $gte: new Date(Date.now() - DISCOVERY_CONFIG.LEARNING.FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000) 
        },
      }).lean();

      const interactionMap = new Map(
        interactions.map(i => [i.coffeeId.toString(), i])
      );

      // Create or update bandit arms
      const arms: BanditArm[] = availableCoffees.map(coffee => {
        const coffeeId = (coffee._id as mongoose.Types.ObjectId).toString();
        const interaction = interactionMap.get(coffeeId);
        
        let trials = 0;
        let successes = 0;
        let averageReward = 0;
        
        if (interaction) {
          trials = 1;
          // Consider rating >= 4 or purchase/favorite as success
          if (interaction.interactionType === 'rating' && interaction.value !== undefined && interaction.value >= 4) {
            successes = 1;
            averageReward = (interaction.value - 3) / 2; // Normalize to 0-1
          } else if (['purchase', 'favorite'].includes(interaction.interactionType)) {
            successes = 1;
            averageReward = 0.8; // High reward for purchase/favorite
          }
        }

        return {
          coffeeId,
          trials,
          successes,
          lastUpdated: new Date(),
          averageReward,
          confidence: trials > 0 ? Math.sqrt(1 / trials) : 1.0,
          attributes: {
            roastLevel: coffee.roastLevel || 'unknown',
            origin: coffee.origin?.country || 'unknown',
            processingMethod: coffee.processingDetails?.method || 'unknown',
            flavorNotes: coffee.flavorProfile?.flavorNotes || [],
            avgRating: coffee.avgRating || 0,
          },
          coffee, // Store full coffee object for recommendation creation
        };
      });

      this.banditArms.set(userId, arms);
      
    } catch (error) {
      logger.error('Error initializing bandit arms:', error);
      this.banditArms.set(userId, []);
    }
  }

  /**
   * Get or create exploration metrics for a user
   */
  private async getExplorationMetrics(userId: string): Promise<ExplorationMetrics> {
    let metrics = this.explorationMetrics.get(userId);
    
    if (!metrics) {
      try {
        // Calculate metrics from user's interaction history
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const interactions = await UserInteraction.find({
          userId: userObjectId,
          timestamp: { 
            $gte: new Date(Date.now() - DISCOVERY_CONFIG.LEARNING.FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000) 
          },
        }).lean();

        const totalInteractions = interactions.length;
        const discoveryInteractions = interactions.filter(i => 
          i.metadata?.source === 'discovery' || i.metadata?.algorithm?.includes('discovery')
        ).length;

        const successfulDiscoveries = interactions.filter(i => 
          (i.metadata?.source === 'discovery' || i.metadata?.algorithm?.includes('discovery')) &&
          ((i.interactionType === 'rating' && i.value !== undefined && i.value >= 4) ||
          ['purchase', 'favorite'].includes(i.interactionType))
        ).length;

        // Calculate diversity score based on variety of coffee attributes
        const uniqueOrigins = new Set(interactions.map(i => i.metadata?.origin).filter(Boolean));
        const uniqueRoasts = new Set(interactions.map(i => i.metadata?.roastLevel).filter(Boolean));
        const diversityScore = Math.min(1.0, (uniqueOrigins.size + uniqueRoasts.size) / 10);

        metrics = {
          userId,
          explorationRate: totalInteractions > 0 ? discoveryInteractions / totalInteractions : 0.1,
          diversityScore,
          noveltyPreference: successfulDiscoveries > 0 ? successfulDiscoveries / Math.max(1, discoveryInteractions) : 0.5,
          lastUpdated: new Date(),
          totalDiscoveryInteractions: discoveryInteractions,
          successfulDiscoveries,
        };

        this.explorationMetrics.set(userId, metrics);
        
      } catch (error) {
        logger.error('Error calculating exploration metrics:', error);
        // Default metrics for new users
        metrics = {
          userId,
          explorationRate: 0.1,
          diversityScore: 0.5,
          noveltyPreference: 0.5,
          lastUpdated: new Date(),
          totalDiscoveryInteractions: 0,
          successfulDiscoveries: 0,
        };
        this.explorationMetrics.set(userId, metrics);
      }
    }
    
    return metrics;
  }

  /**
   * Apply diversity constraints to ensure variety in recommendations
   */
  private applyDiversityConstraints(recommendations: InternalRecommendation[]): InternalRecommendation[] {
    const diversified: InternalRecommendation[] = [];
    const originCount = new Map<string, number>();
    const roastLevelCount = new Map<string, number>();
    const processingCount = new Map<string, number>();

    for (const rec of recommendations) {
      const coffee = rec.coffee;
      if (!coffee) continue;

      const origin = coffee.origin?.country || 'unknown';
      const roastLevel = coffee.roastLevel || 'unknown';
      const processing = coffee.processingDetails?.method || 'unknown';

      // Check diversity constraints
      const currentOriginCount = originCount.get(origin) || 0;
      const currentRoastCount = roastLevelCount.get(roastLevel) || 0;
      const currentProcessingCount = processingCount.get(processing) || 0;

      if (currentOriginCount < DISCOVERY_CONFIG.DIVERSITY.MAX_SAME_ORIGIN &&
          currentRoastCount < DISCOVERY_CONFIG.DIVERSITY.MAX_SAME_ROAST &&
          currentProcessingCount < DISCOVERY_CONFIG.DIVERSITY.MAX_SAME_PROCESSING) {
        
        diversified.push(rec);
        originCount.set(origin, currentOriginCount + 1);
        roastLevelCount.set(roastLevel, currentRoastCount + 1);
        processingCount.set(processing, currentProcessingCount + 1);
      }

      // Stop when we have enough diverse recommendations
      if (diversified.length >= DISCOVERY_CONFIG.MAX_DISCOVERY_RECOMMENDATIONS) break;
    }

    return diversified;
  }

  /**
   * Add discovery-specific reasons to recommendations
   */
  private addDiscoveryReasons(
    recommendations: InternalRecommendation[],
    algorithm: string
  ): InternalRecommendation[] {
    return recommendations.map(rec => {
      const coffee = rec.coffee;
      const reasons: string[] = [];

      // Algorithm-specific reasons
      switch (algorithm) {
        case 'epsilon-greedy':
          reasons.push('Balanced exploration-exploitation choice');
          break;
        case 'ucb':
          reasons.push('High potential with confidence-based selection');
          break;
        case 'thompson-sampling':
          reasons.push('Probabilistic exploration based on uncertainty');
          break;
        case 'hybrid':
          reasons.push('Multi-algorithm discovery recommendation');
          break;
      }

      // Coffee-specific discovery reasons
      if (coffee) {
        if (coffee.origin?.country) {
          reasons.push(`Explore coffee from ${coffee.origin.country}`);
        }
        if (coffee.roastLevel) {
          reasons.push(`Try ${coffee.roastLevel} roast level`);
        }
        if (coffee.processingDetails?.method) {
          reasons.push(`Experience ${coffee.processingDetails.method} processing`);
        }
        if (coffee.flavorProfile?.flavorNotes?.length > 0) {
          const notes = coffee.flavorProfile.flavorNotes.slice(0, 2).join(', ');
          reasons.push(`Discover flavors: ${notes}`);
        }
      }

      return {
        ...rec,
        reasons,
        reason: reasons[0] || 'Discovery recommendation',
        algorithm: `discovery-${algorithm}`,
      };
    });
  }

  /**
   * Create a recommendation object from a bandit arm
   */
  private createRecommendation(
    userId: mongoose.Types.ObjectId,
    arm: BanditArm,
    algorithm: string
  ): InternalRecommendation {
    return {
      userId,
      itemId: new mongoose.Types.ObjectId(arm.coffeeId),
      itemType: 'coffee' as const,
      score: arm.averageReward,
      reason: `Discovery: ${algorithm} selection`,
      algorithm: `discovery-${algorithm}`,
      coffee: arm.coffee,
      reasons: [],
      matchPercentage: Math.round(arm.averageReward * 100),
      context: {
        source: 'discovery',
        algorithm,
        trials: arm.trials,
        confidence: arm.confidence,
      },
    };
  }

  /**
   * Remove duplicate recommendations based on coffee ID
   */
  private deduplicateRecommendations(recommendations: InternalRecommendation[]): InternalRecommendation[] {
    const seen = new Set<string>();
    return recommendations.filter(rec => {
      const coffeeId = rec.itemId.toString();
      if (seen.has(coffeeId)) {
        return false;
      }
      seen.add(coffeeId);
      return true;
    });
  }

  /**
   * Sample from Beta distribution for Thompson Sampling
   */
  private sampleBetaDistribution(alpha: number, beta: number): number {
    // Simple approximation using normal distribution for large alpha, beta
    if (alpha > 1 && beta > 1) {
      const mean = alpha / (alpha + beta);
      const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
      const stddev = Math.sqrt(variance);
      
      // Generate normal random and clamp to [0, 1]
      const normal = this.generateNormalRandom();
      return Math.max(0, Math.min(1, mean + normal * stddev));
    }
    
    // Fallback to uniform for edge cases
    return Math.random();
  }

  /**
   * Generate normal random variable using Box-Muller transform
   */
  private generateNormalRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Update bandit arm based on user feedback
   */
  async updateBanditArm(
    userId: string,
    coffeeId: string,
    feedback: 'positive' | 'negative' | 'neutral'
  ): Promise<void> {
    try {
      const arms = this.banditArms.get(userId);
      if (!arms) return;

      const arm = arms.find(a => a.coffeeId === coffeeId);
      if (!arm) return;

      arm.trials += 1;
      
      if (feedback === 'positive') {
        arm.successes += 1;
      }
      
      arm.averageReward = arm.successes / arm.trials;
      arm.confidence = Math.sqrt(1 / arm.trials);
      arm.lastUpdated = new Date();

      // Update exploration metrics
      const metrics = this.explorationMetrics.get(userId);
      if (metrics) {
        metrics.totalDiscoveryInteractions += 1;
        if (feedback === 'positive') {
          metrics.successfulDiscoveries += 1;
        }
        metrics.lastUpdated = new Date();
      }

      logger.info(`Updated bandit arm for user ${userId}, coffee ${coffeeId}: ${feedback}`);
      
    } catch (error) {
      logger.error('Error updating bandit arm:', error);
    }
  }

  /**
   * Get discovery statistics for a user
   */
  async getDiscoveryStats(userId: string): Promise<{
    explorationRate: number;
    diversityScore: number;
    totalDiscoveries: number;
    successRate: number;
    topPerformingArms: BanditArm[];
  }> {
    const metrics = await this.getExplorationMetrics(userId);
    const arms = this.banditArms.get(userId) || [];
    
    const topPerformingArms = arms
      .filter(arm => arm.trials > 0)
      .sort((a, b) => b.averageReward - a.averageReward)
      .slice(0, 5);

    return {
      explorationRate: metrics.explorationRate,
      diversityScore: metrics.diversityScore,
      totalDiscoveries: metrics.totalDiscoveryInteractions,
      successRate: metrics.totalDiscoveryInteractions > 0 
        ? metrics.successfulDiscoveries / metrics.totalDiscoveryInteractions 
        : 0,
      topPerformingArms,
    };
  }
}

export default new DiscoveryModeService(); 