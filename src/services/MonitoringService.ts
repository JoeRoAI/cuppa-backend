/**
 * MonitoringService.ts
 * Service for real-time monitoring, performance tracking, and model drift detection
 */

import mongoose from 'mongoose';
import { UserInteraction, IUserInteraction } from '../models/recommendation.model';
import User from '../models/user.model';
import Coffee from '../models/coffee.model';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

// Performance metrics interfaces
interface PerformanceMetrics {
  timestamp: Date;
  modelVersion: string;
  algorithm: string;
  metrics: {
    clickThroughRate: number;
    conversionRate: number;
    averageRating: number;
    diversityScore: number;
    noveltyScore: number;
    responseTime: number;
    errorRate: number;
    userEngagement: number;
  };
  sampleSize: number;
}

interface DriftDetectionResult {
  isDriftDetected: boolean;
  driftScore: number;
  driftType: 'concept' | 'data' | 'performance' | 'none';
  confidence: number;
  affectedFeatures: string[];
  recommendation: 'retrain' | 'adjust_parameters' | 'investigate' | 'no_action';
  details: {
    baseline: any;
    current: any;
    threshold: number;
    detectionMethod: string;
  };
}

interface AlertConfig {
  id: string;
  name: string;
  type: 'performance' | 'drift' | 'error' | 'usage';
  condition: {
    metric: string;
    operator: '>' | '<' | '=' | '>=' | '<=';
    threshold: number;
    timeWindow: number; // minutes
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  recipients: string[];
  cooldown: number; // minutes
  lastTriggered?: Date;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: Date;
  services: {
    [serviceName: string]: {
      status: 'healthy' | 'degraded' | 'critical';
      responseTime?: number;
      errorRate?: number;
      lastCheck: Date;
    };
  };
  alerts: Array<{
    id: string;
    severity: string;
    message: string;
    timestamp: Date;
  }>;
}

class MonitoringService extends EventEmitter {
  private readonly METRICS_RETENTION_DAYS = 30;
  private readonly DRIFT_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly PERFORMANCE_WINDOW = 24 * 60 * 60 * 1000; // 24 hours
  
  private metricsHistory = new Map<string, PerformanceMetrics[]>();
  private alertConfigs = new Map<string, AlertConfig>();
  private baselineMetrics = new Map<string, PerformanceMetrics>();
  private driftDetectionEnabled = true;

  constructor() {
    super();
    this.initializeDefaultAlerts();
    this.setupPeriodicTasks();
  }

  /**
   * Record performance metrics for a recommendation request
   * @param metrics Performance metrics data
   */
  recordPerformanceMetrics(metrics: {
    modelVersion: string;
    algorithm: string;
    responseTime: number;
    userId: string;
    recommendationCount: number;
    userInteracted: boolean;
    userConverted: boolean;
    userRating?: number;
    errorOccurred: boolean;
  }): void {
    const timestamp = new Date();
    const key = `${metrics.modelVersion}_${metrics.algorithm}`;

    // Get or create metrics array for this model/algorithm combination
    if (!this.metricsHistory.has(key)) {
      this.metricsHistory.set(key, []);
    }

    const history = this.metricsHistory.get(key)!;
    
    // Calculate aggregated metrics from recent history
    const recentMetrics = this.calculateAggregatedMetrics(history, metrics);

    const performanceMetrics: PerformanceMetrics = {
      timestamp,
      modelVersion: metrics.modelVersion,
      algorithm: metrics.algorithm,
      metrics: recentMetrics,
      sampleSize: Math.min(history.length + 1, 1000) // Limit sample size
    };

    // Add to history
    history.push(performanceMetrics);

    // Cleanup old metrics
    this.cleanupOldMetrics(history);

    // Emit metrics event
    this.emit('metricsRecorded', performanceMetrics);

    // Check for alerts
    this.checkAlerts(performanceMetrics);

    logger.debug(`Performance metrics recorded for ${key}`, {
      responseTime: metrics.responseTime,
      ctr: recentMetrics.clickThroughRate,
      conversionRate: recentMetrics.conversionRate
    });
  }

  /**
   * Detect model drift using statistical methods
   * @param modelVersion Model version to check
   * @param algorithm Algorithm to check
   * @returns Drift detection result
   */
  async detectModelDrift(modelVersion: string, algorithm: string): Promise<DriftDetectionResult> {
    const key = `${modelVersion}_${algorithm}`;
    const currentMetrics = this.metricsHistory.get(key);
    const baseline = this.baselineMetrics.get(key);

    if (!currentMetrics || currentMetrics.length < 10 || !baseline) {
      return {
        isDriftDetected: false,
        driftScore: 0,
        driftType: 'none',
        confidence: 0,
        affectedFeatures: [],
        recommendation: 'no_action',
        details: {
          baseline: null,
          current: null,
          threshold: 0.1,
          detectionMethod: 'insufficient_data'
        }
      };
    }

    // Get recent metrics for comparison
    const recentMetrics = currentMetrics.slice(-10);
    const currentAvg = this.calculateAverageMetrics(recentMetrics);

    // Perform drift detection using multiple methods
    const performanceDrift = this.detectPerformanceDrift(baseline.metrics, currentAvg);
    const dataDrift = await this.detectDataDrift();
    const conceptDrift = this.detectConceptDrift(baseline.metrics, currentAvg);

    // Determine overall drift
    const maxDriftScore = Math.max(performanceDrift.score, dataDrift.score, conceptDrift.score);
    const driftThreshold = 0.15; // 15% change threshold

    const isDriftDetected = maxDriftScore > driftThreshold;
    let driftType: DriftDetectionResult['driftType'] = 'none';
    let recommendation: DriftDetectionResult['recommendation'] = 'no_action';

    if (isDriftDetected) {
      if (performanceDrift.score === maxDriftScore) {
        driftType = 'performance';
        recommendation = maxDriftScore > 0.3 ? 'retrain' : 'adjust_parameters';
      } else if (dataDrift.score === maxDriftScore) {
        driftType = 'data';
        recommendation = 'investigate';
      } else {
        driftType = 'concept';
        recommendation = 'retrain';
      }
    }

    const result: DriftDetectionResult = {
      isDriftDetected,
      driftScore: maxDriftScore,
      driftType,
      confidence: Math.min(maxDriftScore * 2, 1), // Convert to confidence score
      affectedFeatures: [
        ...(performanceDrift.affectedMetrics || []),
        ...(dataDrift.affectedFeatures || []),
        ...(conceptDrift.affectedMetrics || [])
      ],
      recommendation,
      details: {
        baseline: baseline.metrics,
        current: currentAvg,
        threshold: driftThreshold,
        detectionMethod: 'statistical_comparison'
      }
    };

    // Emit drift detection event
    if (isDriftDetected) {
      this.emit('driftDetected', result);
      logger.warn(`Model drift detected for ${key}`, {
        driftScore: maxDriftScore,
        driftType,
        recommendation
      });
    }

    return result;
  }

  /**
   * Get system health status
   * @returns System health information
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const timestamp = new Date();
    const services: SystemHealth['services'] = {};

    // Check recommendation engine health
    services.recommendationEngine = await this.checkServiceHealth('recommendationEngine');
    
    // Check data ingestion health
    services.dataIngestion = await this.checkServiceHealth('dataIngestion');
    
    // Check feature engineering health
    services.featureEngineering = await this.checkServiceHealth('featureEngineering');
    
    // Check model serving health
    services.modelServing = await this.checkServiceHealth('modelServing');

    // Check database health
    services.database = await this.checkDatabaseHealth();

    // Determine overall system status
    const serviceStatuses = Object.values(services).map(s => s.status);
    let overallStatus: SystemHealth['status'] = 'healthy';
    
    if (serviceStatuses.includes('critical')) {
      overallStatus = 'critical';
    } else if (serviceStatuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    // Get active alerts
    const alerts = this.getActiveAlerts();

    return {
      status: overallStatus,
      timestamp,
      services,
      alerts
    };
  }

  /**
   * Set baseline metrics for drift detection
   * @param modelVersion Model version
   * @param algorithm Algorithm
   */
  setBaseline(modelVersion: string, algorithm: string): void {
    const key = `${modelVersion}_${algorithm}`;
    const history = this.metricsHistory.get(key);

    if (!history || history.length < 5) {
      logger.warn(`Insufficient data to set baseline for ${key}`);
      return;
    }

    // Use the average of the last 5 metrics as baseline
    const recentMetrics = history.slice(-5);
    const averageMetrics = this.calculateAverageMetrics(recentMetrics);

    const baseline: PerformanceMetrics = {
      timestamp: new Date(),
      modelVersion,
      algorithm,
      metrics: averageMetrics,
      sampleSize: recentMetrics.length
    };

    this.baselineMetrics.set(key, baseline);
    
    this.emit('baselineSet', { modelVersion, algorithm, baseline });
    logger.info(`Baseline set for ${key}`, averageMetrics);
  }

  /**
   * Calculate aggregated metrics from history and current request
   * @private
   */
  private calculateAggregatedMetrics(
    history: PerformanceMetrics[],
    currentRequest: any
  ): PerformanceMetrics['metrics'] {
    // Get recent history (last 100 requests)
    const recentHistory = history.slice(-100);
    
    // Calculate running averages
    const totalRequests = recentHistory.length + 1;
    const interactions = recentHistory.filter(m => m.metrics.clickThroughRate > 0).length + (currentRequest.userInteracted ? 1 : 0);
    const conversions = recentHistory.filter(m => m.metrics.conversionRate > 0).length + (currentRequest.userConverted ? 1 : 0);
    const errors = recentHistory.filter(m => m.metrics.errorRate > 0).length + (currentRequest.errorOccurred ? 1 : 0);

    const avgResponseTime = recentHistory.length > 0
      ? (recentHistory.reduce((sum, m) => sum + m.metrics.responseTime, 0) + currentRequest.responseTime) / totalRequests
      : currentRequest.responseTime;

    const avgRating = recentHistory.length > 0
      ? recentHistory.reduce((sum, m) => sum + m.metrics.averageRating, 0) / recentHistory.length
      : currentRequest.userRating || 0;

    return {
      clickThroughRate: interactions / totalRequests,
      conversionRate: conversions / totalRequests,
      averageRating: avgRating,
      diversityScore: 0.7, // Would need actual diversity calculation
      noveltyScore: 0.6, // Would need actual novelty calculation
      responseTime: avgResponseTime,
      errorRate: errors / totalRequests,
      userEngagement: interactions / totalRequests
    };
  }

  /**
   * Calculate average metrics from an array of performance metrics
   * @private
   */
  private calculateAverageMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics['metrics'] {
    if (metrics.length === 0) {
      return {
        clickThroughRate: 0,
        conversionRate: 0,
        averageRating: 0,
        diversityScore: 0,
        noveltyScore: 0,
        responseTime: 0,
        errorRate: 0,
        userEngagement: 0
      };
    }

    const sum = metrics.reduce((acc, m) => ({
      clickThroughRate: acc.clickThroughRate + m.metrics.clickThroughRate,
      conversionRate: acc.conversionRate + m.metrics.conversionRate,
      averageRating: acc.averageRating + m.metrics.averageRating,
      diversityScore: acc.diversityScore + m.metrics.diversityScore,
      noveltyScore: acc.noveltyScore + m.metrics.noveltyScore,
      responseTime: acc.responseTime + m.metrics.responseTime,
      errorRate: acc.errorRate + m.metrics.errorRate,
      userEngagement: acc.userEngagement + m.metrics.userEngagement
    }), {
      clickThroughRate: 0,
      conversionRate: 0,
      averageRating: 0,
      diversityScore: 0,
      noveltyScore: 0,
      responseTime: 0,
      errorRate: 0,
      userEngagement: 0
    });

    const count = metrics.length;
    return {
      clickThroughRate: sum.clickThroughRate / count,
      conversionRate: sum.conversionRate / count,
      averageRating: sum.averageRating / count,
      diversityScore: sum.diversityScore / count,
      noveltyScore: sum.noveltyScore / count,
      responseTime: sum.responseTime / count,
      errorRate: sum.errorRate / count,
      userEngagement: sum.userEngagement / count
    };
  }

  /**
   * Detect performance drift
   * @private
   */
  private detectPerformanceDrift(
    baseline: PerformanceMetrics['metrics'],
    current: PerformanceMetrics['metrics']
  ): { score: number; affectedMetrics: string[] } {
    const thresholds = {
      clickThroughRate: 0.1,
      conversionRate: 0.1,
      averageRating: 0.2,
      responseTime: 0.3,
      errorRate: 0.05
    };

    const affectedMetrics: string[] = [];
    let maxDrift = 0;

    for (const [metric, threshold] of Object.entries(thresholds)) {
      const baselineValue = baseline[metric as keyof typeof baseline];
      const currentValue = current[metric as keyof typeof current];
      
      if (baselineValue > 0) {
        const drift = Math.abs(currentValue - baselineValue) / baselineValue;
        if (drift > threshold) {
          affectedMetrics.push(metric);
          maxDrift = Math.max(maxDrift, drift);
        }
      }
    }

    return { score: maxDrift, affectedMetrics };
  }

  /**
   * Detect data drift (simplified)
   * @private
   */
  private async detectDataDrift(): Promise<{ score: number; affectedFeatures: string[] }> {
    // Simplified data drift detection
    // In a real implementation, this would analyze feature distributions
    return { score: 0.05, affectedFeatures: [] };
  }

  /**
   * Detect concept drift
   * @private
   */
  private detectConceptDrift(
    baseline: PerformanceMetrics['metrics'],
    current: PerformanceMetrics['metrics']
  ): { score: number; affectedMetrics: string[] } {
    // Focus on user behavior metrics for concept drift
    const behaviorMetrics = ['clickThroughRate', 'conversionRate', 'userEngagement'];
    const affectedMetrics: string[] = [];
    let maxDrift = 0;

    for (const metric of behaviorMetrics) {
      const baselineValue = baseline[metric as keyof typeof baseline];
      const currentValue = current[metric as keyof typeof current];
      
      if (baselineValue > 0) {
        const drift = Math.abs(currentValue - baselineValue) / baselineValue;
        if (drift > 0.15) {
          affectedMetrics.push(metric);
          maxDrift = Math.max(maxDrift, drift);
        }
      }
    }

    return { score: maxDrift, affectedMetrics };
  }

  /**
   * Check service health
   * @private
   */
  private async checkServiceHealth(serviceName: string): Promise<SystemHealth['services'][string]> {
    const startTime = Date.now();
    
    try {
      // Simulate health check - in real implementation, would ping actual services
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: responseTime > 1000 ? 'degraded' : 'healthy',
        responseTime,
        errorRate: 0,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'critical',
        responseTime: Date.now() - startTime,
        errorRate: 1,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Check database health
   * @private
   */
  private async checkDatabaseHealth(): Promise<SystemHealth['services'][string]> {
    const startTime = Date.now();
    
    try {
      // Simple database ping
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
      } else {
        throw new Error('Database connection not established');
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: responseTime > 500 ? 'degraded' : 'healthy',
        responseTime,
        errorRate: 0,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'critical',
        responseTime: Date.now() - startTime,
        errorRate: 1,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Check alerts against current metrics
   * @private
   */
  private checkAlerts(metrics: PerformanceMetrics): void {
    for (const alert of this.alertConfigs.values()) {
      if (!alert.enabled) continue;
      
      // Check cooldown
      if (alert.lastTriggered && 
          Date.now() - alert.lastTriggered.getTime() < alert.cooldown * 60 * 1000) {
        continue;
      }

      const metricValue = metrics.metrics[alert.condition.metric as keyof typeof metrics.metrics];
      const threshold = alert.condition.threshold;
      
      let triggered = false;
      switch (alert.condition.operator) {
        case '>':
          triggered = metricValue > threshold;
          break;
        case '<':
          triggered = metricValue < threshold;
          break;
        case '>=':
          triggered = metricValue >= threshold;
          break;
        case '<=':
          triggered = metricValue <= threshold;
          break;
        case '=':
          triggered = Math.abs(metricValue - threshold) < 0.001;
          break;
      }

      if (triggered) {
        this.triggerAlert(alert, metricValue);
      }
    }
  }

  /**
   * Trigger an alert
   * @private
   */
  private triggerAlert(alert: AlertConfig, currentValue: number): void {
    alert.lastTriggered = new Date();
    
    const alertData = {
      id: alert.id,
      name: alert.name,
      severity: alert.severity,
      message: `${alert.name}: ${alert.condition.metric} is ${currentValue} (threshold: ${alert.condition.threshold})`,
      timestamp: new Date(),
      currentValue,
      threshold: alert.condition.threshold
    };

    this.emit('alertTriggered', alertData);
    
    logger.warn(`Alert triggered: ${alert.name}`, alertData);
  }

  /**
   * Get active alerts
   * @private
   */
  private getActiveAlerts(): SystemHealth['alerts'] {
    // Return recent alerts (last 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return Array.from(this.alertConfigs.values())
      .filter(alert => alert.lastTriggered && alert.lastTriggered > cutoff)
      .map(alert => ({
        id: alert.id,
        severity: alert.severity,
        message: alert.name,
        timestamp: alert.lastTriggered!
      }));
  }

  /**
   * Initialize default alert configurations
   * @private
   */
  private initializeDefaultAlerts(): void {
    const defaultAlerts: AlertConfig[] = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        type: 'error',
        condition: { metric: 'errorRate', operator: '>', threshold: 0.05, timeWindow: 15 },
        severity: 'high',
        enabled: true,
        recipients: ['admin@cuppa.com'],
        cooldown: 30
      },
      {
        id: 'low_ctr',
        name: 'Low Click-Through Rate',
        type: 'performance',
        condition: { metric: 'clickThroughRate', operator: '<', threshold: 0.1, timeWindow: 60 },
        severity: 'medium',
        enabled: true,
        recipients: ['admin@cuppa.com'],
        cooldown: 60
      },
      {
        id: 'high_response_time',
        name: 'High Response Time',
        type: 'performance',
        condition: { metric: 'responseTime', operator: '>', threshold: 1000, timeWindow: 10 },
        severity: 'medium',
        enabled: true,
        recipients: ['admin@cuppa.com'],
        cooldown: 15
      }
    ];

    defaultAlerts.forEach(alert => {
      this.alertConfigs.set(alert.id, alert);
    });
  }

  /**
   * Setup periodic monitoring tasks
   * @private
   */
  private setupPeriodicTasks(): void {
    // Drift detection check every hour
    setInterval(async () => {
      if (!this.driftDetectionEnabled) return;

      for (const [key, metrics] of this.metricsHistory.entries()) {
        if (metrics.length > 0) {
          const [modelVersion, algorithm] = key.split('_');
          await this.detectModelDrift(modelVersion, algorithm);
        }
      }
    }, this.DRIFT_CHECK_INTERVAL);

    // Cleanup old metrics daily
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 24 * 60 * 60 * 1000);

    logger.info('Monitoring service initialized with periodic tasks');
  }

  /**
   * Cleanup old metrics
   * @private
   */
  private cleanupOldMetrics(specificHistory?: PerformanceMetrics[]): void {
    const cutoff = new Date(Date.now() - this.METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    if (specificHistory) {
      // Clean specific history array
      const index = specificHistory.findIndex(m => m.timestamp > cutoff);
      if (index > 0) {
        specificHistory.splice(0, index);
      }
    } else {
      // Clean all histories
      for (const [key, history] of this.metricsHistory.entries()) {
        const index = history.findIndex(m => m.timestamp > cutoff);
        if (index > 0) {
          history.splice(0, index);
        }
        
        // Remove empty histories
        if (history.length === 0) {
          this.metricsHistory.delete(key);
        }
      }
    }
  }

  /**
   * Get monitoring statistics
   * @returns Monitoring service statistics
   */
  getMonitoringStats(): {
    metricsCollected: number;
    alertsConfigured: number;
    baselinesSet: number;
    driftDetectionEnabled: boolean;
    lastDriftCheck: Date | null;
  } {
    const totalMetrics = Array.from(this.metricsHistory.values())
      .reduce((sum, history) => sum + history.length, 0);

    return {
      metricsCollected: totalMetrics,
      alertsConfigured: this.alertConfigs.size,
      baselinesSet: this.baselineMetrics.size,
      driftDetectionEnabled: this.driftDetectionEnabled,
      lastDriftCheck: new Date() // Simplified
    };
  }
}

export default new MonitoringService(); 