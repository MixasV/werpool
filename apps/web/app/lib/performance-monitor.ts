'use client';

import { PerformanceBudget } from './browser-detection';

/**
 * Performance Monitoring Utilities
 * Track Core Web Vitals and custom metrics
 */

export interface PerformanceMetrics {
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  ttfb?: number; // Time to First Byte
  tti?: number; // Time to Interactive
}

export class PerformanceMonitor {
  private static metrics: PerformanceMetrics = {};

  /**
   * Initialize performance observers
   */
  static init() {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    try {
      // Observe paint metrics (FCP, LCP)
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.fcp = entry.startTime;
            this.checkBudget('firstContentfulPaint', entry.startTime);
          }
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });

      // Observe LCP
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        this.metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
        if (this.metrics.lcp !== undefined) {
          this.checkBudget('largestContentfulPaint', this.metrics.lcp);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // Observe FID
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.metrics.fid = (entry as any).processingStart - entry.startTime;
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Observe CLS
      const clsObserver = new PerformanceObserver((list) => {
        let clsScore = 0;
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsScore += (entry as any).value;
          }
        }
        this.metrics.cls = clsScore;
        this.checkBudget('cumulativeLayoutShift', clsScore);
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

    } catch (error) {
      console.warn('Performance monitoring initialization failed:', error);
    }
  }

  /**
   * Check if metric exceeds performance budget
   */
  private static checkBudget(metric: string, value: number) {
    const budgets = PerformanceBudget.getTargets();
    const budget = budgets[metric as keyof typeof budgets];
    
    if (budget && value > budget) {
      console.warn(
        `Performance budget exceeded for ${metric}:`,
        `${value.toFixed(2)}ms > ${budget}ms`
      );
    }
  }

  /**
   * Get current metrics
   */
  static getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Log performance metrics to console (dev mode)
   */
  static logMetrics() {
    if (process.env.NODE_ENV === 'development') {
      console.table(this.metrics);
    }
  }

  /**
   * Send metrics to analytics (placeholder)
   */
  static sendToAnalytics(endpoint?: string) {
    if (endpoint && Object.keys(this.metrics).length > 0) {
      // Implementation would send to your analytics service
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: this.metrics,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        }),
      }).catch((err) => console.error('Failed to send metrics:', err));
    }
  }
}

/**
 * React Hook for performance monitoring
 */
export function usePerformanceMonitor() {
  if (typeof window !== 'undefined') {
    PerformanceMonitor.init();
  }

  return {
    metrics: PerformanceMonitor.getMetrics(),
    logMetrics: () => PerformanceMonitor.logMetrics(),
  };
}
