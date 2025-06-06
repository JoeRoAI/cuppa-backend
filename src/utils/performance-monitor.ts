/**
 * Performance Monitoring Utility for Taste Profile System
 * Tracks optimization improvements and system metrics
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  timestamp: Date;
}

interface OptimizationReport {
  component: string;
  beforeOptimization: PerformanceMetric[];
  afterOptimization: PerformanceMetric[];
  improvementPercentage: number;
  recommendations: string[];
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private systemMetrics: SystemMetrics[] = [];
  private startTimes: Map<string, number> = new Map();

  /**
   * Start timing a performance metric
   */
  startTiming(metricName: string): void {
    this.startTimes.set(metricName, Date.now());
  }

  /**
   * End timing and record a performance metric
   */
  endTiming(metricName: string, metadata?: Record<string, any>): number {
    const startTime = this.startTimes.get(metricName);
    if (!startTime) {
      console.warn(`No start time found for metric: ${metricName}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.recordMetric(metricName, duration, metadata);
    this.startTimes.delete(metricName);

    return duration;
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, duration: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: new Date(),
      metadata,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(metric);

    // Keep only last 100 metrics per type to prevent memory leaks
    const metrics = this.metrics.get(name)!;
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }

    // Log slow operations
    if (duration > 1000) {
      console.warn(`Slow operation detected: ${name} took ${duration}ms`, metadata);
    }
  }

  /**
   * Record system metrics
   */
  recordSystemMetrics(): void {
    const systemMetric: SystemMetrics = {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date(),
    };

    this.systemMetrics.push(systemMetric);

    // Keep only last 50 system metrics
    if (this.systemMetrics.length > 50) {
      this.systemMetrics.splice(0, this.systemMetrics.length - 50);
    }
  }

  /**
   * Get average performance for a metric
   */
  getAveragePerformance(metricName: string, timeWindowMs?: number): number | null {
    const metrics = this.metrics.get(metricName);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    let filteredMetrics = metrics;
    if (timeWindowMs) {
      const cutoffTime = new Date(Date.now() - timeWindowMs);
      filteredMetrics = metrics.filter((m) => m.timestamp >= cutoffTime);
    }

    if (filteredMetrics.length === 0) {
      return null;
    }

    const totalDuration = filteredMetrics.reduce((sum, metric) => sum + metric.duration, 0);
    return totalDuration / filteredMetrics.length;
  }

  /**
   * Get performance percentiles
   */
  getPerformancePercentiles(
    metricName: string
  ): { p50: number; p90: number; p95: number; p99: number } | null {
    const metrics = this.metrics.get(metricName);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const durations = metrics.map((m) => m.duration).sort((a, b) => a - b);
    const length = durations.length;

    return {
      p50: durations[Math.floor(length * 0.5)],
      p90: durations[Math.floor(length * 0.9)],
      p95: durations[Math.floor(length * 0.95)],
      p99: durations[Math.floor(length * 0.99)],
    };
  }

  /**
   * Generate optimization report
   */
  generateOptimizationReport(component: string): OptimizationReport {
    const beforeMetrics = this.metrics.get(`${component}_before`) || [];
    const afterMetrics = this.metrics.get(`${component}_after`) || [];

    const beforeAvg =
      beforeMetrics.length > 0
        ? beforeMetrics.reduce((sum, m) => sum + m.duration, 0) / beforeMetrics.length
        : 0;

    const afterAvg =
      afterMetrics.length > 0
        ? afterMetrics.reduce((sum, m) => sum + m.duration, 0) / afterMetrics.length
        : 0;

    const improvementPercentage = beforeAvg > 0 ? ((beforeAvg - afterAvg) / beforeAvg) * 100 : 0;

    const recommendations = this.generateRecommendations(component, beforeAvg, afterAvg);

    return {
      component,
      beforeOptimization: beforeMetrics,
      afterOptimization: afterMetrics,
      improvementPercentage,
      recommendations,
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    component: string,
    beforeAvg: number,
    afterAvg: number
  ): string[] {
    const recommendations: string[] = [];

    if (afterAvg > 1000) {
      recommendations.push(
        `${component} still takes over 1 second on average. Consider further optimization.`
      );
    }

    if (beforeAvg > 0 && afterAvg > beforeAvg * 0.8) {
      recommendations.push(
        `${component} optimization showed minimal improvement. Review implementation.`
      );
    }

    if (afterAvg < 200) {
      recommendations.push(`${component} performance is excellent (< 200ms average).`);
    }

    // Component-specific recommendations
    switch (component) {
      case 'taste_profile_aggregation':
        if (afterAvg > 500) {
          recommendations.push(
            'Consider implementing more aggressive caching for aggregation queries.'
          );
          recommendations.push('Review database indexes for aggregation pipeline optimization.');
        }
        break;

      case 'similarity_calculation':
        if (afterAvg > 2000) {
          recommendations.push(
            'Implement approximate nearest neighbor algorithms for large user bases.'
          );
          recommendations.push(
            'Consider vectorization and batch processing for similarity calculations.'
          );
        }
        break;

      case 'chart_rendering':
        if (afterAvg > 300) {
          recommendations.push('Implement data sampling for large datasets in chart rendering.');
          recommendations.push('Consider using react-native-skia for better chart performance.');
        }
        break;
    }

    return recommendations;
  }

  /**
   * Get comprehensive performance summary
   */
  getPerformanceSummary(): any {
    const summary: any = {
      timestamp: new Date(),
      metrics: {},
      systemMetrics: this.getLatestSystemMetrics(),
      alerts: [],
    };

    // Process each metric type
    for (const [metricName, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const avg = this.getAveragePerformance(metricName);
      const percentiles = this.getPerformancePercentiles(metricName);
      const recent = metrics.slice(-10); // Last 10 measurements

      summary.metrics[metricName] = {
        average: avg,
        percentiles,
        recentMeasurements: recent.length,
        lastMeasurement: recent[recent.length - 1],
      };

      // Generate alerts for performance issues
      if (avg && avg > 2000) {
        summary.alerts.push({
          type: 'SLOW_OPERATION',
          metric: metricName,
          value: avg,
          message: `${metricName} is averaging ${avg.toFixed(0)}ms, which is above the 2s threshold.`,
        });
      }

      if (percentiles && percentiles.p95 > 5000) {
        summary.alerts.push({
          type: 'HIGH_LATENCY_TAIL',
          metric: metricName,
          value: percentiles.p95,
          message: `${metricName} 95th percentile is ${percentiles.p95.toFixed(0)}ms, indicating latency issues.`,
        });
      }
    }

    return summary;
  }

  /**
   * Get latest system metrics
   */
  private getLatestSystemMetrics(): any {
    if (this.systemMetrics.length === 0) {
      return null;
    }

    const latest = this.systemMetrics[this.systemMetrics.length - 1];
    return {
      memoryUsage: {
        rss: `${(latest.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(latest.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(latest.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(latest.memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
      },
      timestamp: latest.timestamp,
    };
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): any {
    return {
      performanceMetrics: Object.fromEntries(this.metrics),
      systemMetrics: this.systemMetrics,
      exportTimestamp: new Date(),
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.systemMetrics.length = 0;
    this.startTimes.clear();
  }

  /**
   * Start automatic system monitoring
   */
  startSystemMonitoring(intervalMs: number = 30000): NodeJS.Timeout {
    return setInterval(() => {
      this.recordSystemMetrics();
    }, intervalMs);
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Convenience functions for common operations
export const trackTasteProfileGeneration = (
  userId: string,
  duration: number,
  ratingCount: number
) => {
  performanceMonitor.recordMetric('taste_profile_generation', duration, {
    userId,
    ratingCount,
  });
};

export const trackSimilarityCalculation = (duration: number, userCount: number) => {
  performanceMonitor.recordMetric('similarity_calculation', duration, {
    userCount,
  });
};

export const trackChartRendering = (chartType: string, duration: number, dataPoints: number) => {
  performanceMonitor.recordMetric('chart_rendering', duration, {
    chartType,
    dataPoints,
  });
};

export const trackAggregationQuery = (
  duration: number,
  pipelineStages: number,
  resultCount: number
) => {
  performanceMonitor.recordMetric('aggregation_query', duration, {
    pipelineStages,
    resultCount,
  });
};

// Performance decorator for async functions
export function performanceTrack(metricName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      performanceMonitor.startTiming(metricName);
      try {
        const result = await method.apply(this, args);
        performanceMonitor.endTiming(metricName);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        performanceMonitor.endTiming(metricName, { error: errorMessage });
        throw error;
      }
    };

    return descriptor;
  };
}

export default PerformanceMonitor;
