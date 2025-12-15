// src/utils/circuitBreaker.js
const CircuitBreaker = require("opossum");
const logger = require("./logger");

/**
 * Create circuit breaker for email channel
 */
function createEmailCircuitBreaker(fn) {
  const breaker = new CircuitBreaker(fn, {
    timeout: 15000, // 15 second timeout
    errorThresholdPercentage: 50, // Open after 50% errors
    resetTimeout: 30000, // Try again after 30 seconds
    volumeThreshold: 5, // Minimum requests before opening
    name: "email-breaker",
  });

  breaker.fallback(() => ({
    success: false,
    fallback: true,
    error: "Email service temporarily unavailable",
  }));

  breaker.on("open", () => {
    logger.warn("⚠️ Email circuit breaker OPENED");
  });

  breaker.on("halfOpen", () => {
    logger.info("🔄 Email circuit breaker HALF-OPEN (testing)");
  });

  breaker.on("close", () => {
    logger.info("✅ Email circuit breaker CLOSED");
  });

  return breaker;
}

/**
 * Create circuit breaker for SMS channel
 */
function createSmsCircuitBreaker(fn) {
  const breaker = new CircuitBreaker(fn, {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
    name: "sms-breaker",
  });

  breaker.fallback(() => ({
    success: false,
    fallback: true,
    error: "SMS service temporarily unavailable",
  }));

  breaker.on("open", () => {
    logger.warn("⚠️ SMS circuit breaker OPENED");
  });

  breaker.on("close", () => {
    logger.info("✅ SMS circuit breaker CLOSED");
  });

  return breaker;
}

/**
 * Create circuit breaker for push notification channel
 */
function createPushCircuitBreaker(fn) {
  const breaker = new CircuitBreaker(fn, {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
    name: "push-breaker",
  });

  breaker.fallback(() => ({
    success: false,
    fallback: true,
    error: "Push notification service temporarily unavailable",
  }));

  breaker.on("open", () => {
    logger.warn("⚠️ Push circuit breaker OPENED");
  });

  breaker.on("close", () => {
    logger.info("✅ Push circuit breaker CLOSED");
  });

  return breaker;
}

/**
 * Get circuit breaker status
 */
function getCircuitBreakerStatus(breaker) {
  return {
    name: breaker.name,
    state: breaker.opened ? "open" : breaker.halfOpen ? "half-open" : "closed",
    stats: {
      fires: breaker.stats.fires,
      failures: breaker.stats.failures,
      successes: breaker.stats.successes,
      timeouts: breaker.stats.timeouts,
      fallbacks: breaker.stats.fallbacks,
    },
  };
}

module.exports = {
  createEmailCircuitBreaker,
  createSmsCircuitBreaker,
  createPushCircuitBreaker,
  getCircuitBreakerStatus,
};

