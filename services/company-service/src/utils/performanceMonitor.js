/**
 * Performance Monitoring Utility
 * Tracks operation timing to ensure all operations complete within 50ms SLA
 */

const logger = require('./logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      operations: [],
      slowOperations: [],
    };
  }

  /**
   * Measure operation time
   * @param {string} operationName - Name of operation
   * @param {function} operation - Async function to measure
   * @param {number} slaMs - SLA threshold in milliseconds (default: 50ms)
   * @returns {Promise} - Result of operation
   */
  async measureAsync(operationName, operation, slaMs = 50) {
    const startTime = Date.now();
    let result;
    let error;

    try {
      result = await operation();
    } catch (err) {
      error = err;
    }

    const duration = Date.now() - startTime;
    const isSlow = duration > slaMs;

    // Log metric
    const metric = {
      operationName,
      duration,
      timestamp: new Date().toISOString(),
      isSlow,
      slaMs,
    };

    this.metrics.operations.push(metric);
    if (isSlow) {
      this.metrics.slowOperations.push(metric);
      logger.warn(`SLOW_OPERATION: ${operationName} took ${duration}ms (SLA: ${slaMs}ms)`);
    } else {
      logger.debug(`Operation ${operationName} completed in ${duration}ms`);
    }

    if (error) {
      throw error;
    }

    return result;
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const total = this.metrics.operations.length;
    const slow = this.metrics.slowOperations.length;
    const avgTime = total > 0
      ? this.metrics.operations.reduce((sum, m) => sum + m.duration, 0) / total
      : 0;

    return {
      totalOperations: total,
      slowOperations: slow,
      slowPercentage: total > 0 ? ((slow / total) * 100).toFixed(2) + '%' : '0%',
      averageTime: avgTime.toFixed(2) + 'ms',
      slowOperations: this.metrics.slowOperations.slice(-20), // Last 20
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      operations: [],
      slowOperations: [],
    };
  }
}

module.exports = new PerformanceMonitor();
