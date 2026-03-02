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
    errorFilter: (err) => {
      // Ignore client-side format/config errors (4xx) so they don't trip the breaker
      if (err && err.error && err.error.response && err.error.response.status < 500) return true;
      if (err && err.error && err.error.status && err.error.status < 500) return true;
      return false;
    }
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
    errorThresholdPercentage: 80, // Even less sensitive to transient errors
    resetTimeout: 10000, // Faster recovery (10s)
    volumeThreshold: 10, // Minimum 10 requests before opening
    name: "sms-breaker",
    errorFilter: (err) => {
      // Twilio errors typically include a status property or err.error.status.
      // E.g., Unverified number (21608) triggers a 400.
      if (err && err.error && err.error.status && err.error.status < 500) return true;
      return false;
    }
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
    errorThresholdPercentage: 80, // Even less sensitive to transient errors
    resetTimeout: 10000, // Faster recovery (10s)
    volumeThreshold: 10, // Minimum 10 requests before opening
    name: "push-breaker",
    errorFilter: (err) => {
      // Be defensive: errors can arrive in multiple shapes depending on
      // where they originate (firebase admin, HTTP libs, custom wrappers).
      // Try to extract a meaningful `code` or `status` from common locations
      // and treat client-side (4xx) / firebase messaging user errors as
      // non-fatal for circuit-breaking purposes.
      try {
        const userErrorCodes = [
          'messaging/invalid-registration-token',
          'messaging/registration-token-not-registered',
          'messaging/invalid-argument',
          'messaging/invalid-payload',
          'messaging/mismatched-credential',
          'messaging/third-party-auth-error',
        ];

        // Possible places for a code
        const code = (err && err.error && err.error.code) || err.code || (err && err.code) || null;

        if (code && userErrorCodes.includes(code)) {
          logger.debug(`🔍 Push error filtered (user error code): ${code}`);
          return true;
        }

        // Possible places for an HTTP status
        const status = (err && err.error && err.error.status) || (err && err.status) || (err && err.response && err.response.status) || (err && err.error && err.error.response && err.error.response.status) || null;

        if (status && status < 500) {
          logger.debug(`🔍 Push error filtered (4xx status): ${status}`);
          return true;
        }

        // Sometimes the message text includes helpful hints
        if (err && err.message && typeof err.message === 'string') {
          const msg = err.message.toLowerCase();
          if (msg.includes('invalid registration') || msg.includes('not registered') || msg.includes('registration-token-not-registered') || msg.includes('invalid-argument')) {
            logger.debug(`🔍 Push error filtered (message): ${err.message}`);
            return true;
          }
        }
      } catch (e) {
        // If our inspection fails, don't accidentally filter valid system errors.
        logger.debug('⚠️ push errorFilter inspection failed', { inspectError: e && e.message });
      }

      // Treat everything else (5xx or unknown) as a potential system error
      // so the circuit breaker can open when appropriate.
      return false;
    }
  });

  breaker.fallback(() => ({
    success: false,
    fallback: true,
    error: "Push notification service temporarily unavailable",
  }));

  breaker.on("open", () => {
    const stats = breaker.stats;
    logger.warn(`⚠️  push circuit breaker open`, {
      stats: {
        fires: stats.fires,
        failures: stats.failures,
        successes: stats.successes,
        timeouts: stats.timeouts,
        fallbacks: stats.fallbacks,
        errorRate: stats.fires > 0 ? ((stats.failures / stats.fires) * 100).toFixed(2) + '%' : '0%'
      },
      resetTimeout: breaker.options.resetTimeout,
      message: `Circuit breaker opened after ${stats.failures} failures in ${stats.fires} requests`
    });
  });

  breaker.on("halfOpen", () => {
    logger.info("🔄 Push circuit breaker HALF-OPEN (testing recovery)");
  });

  breaker.on("close", () => {
    const stats = breaker.stats;
    logger.info("✅ Push circuit breaker CLOSED (service recovered)", {
      stats: {
        fires: stats.fires,
        successes: stats.successes,
        totalRecovered: stats.successes
      }
    });
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