const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const {
  routes,
  authProxy,
  companyProxy,
  shopProxy,
  inventoryProxy,
  salesProxy,
  paymentProxy,
  ecommerceProxy,
  notificationProxy,
  analyticsProxy,
  auditProxy,
  debtProxy,
  websocketProxy,
  authenticateToken,
} = require("./routes/proxy");
const { limiter, authLimiter } = require("./utils/rateLimiter");
const redisClient = require("/app/shared/redis");
const { initSubscriptionEventConsumer, createCacheInvalidationEndpoint } = require("./events/subscriptionEventConsumer");
const {
  checkSubscriptionStatus,
  checkSubscriptionTier,
  checkFeatureAccess,
  checkRateLimits,
} = require("./middleware");

const app = express();

// Redis is initialized via require("/app/shared/redis")


// Security middleware
app.use(helmet()); // Set security HTTP headers
app.use(mongoSanitize()); // Sanitize data against NoSQL injection
app.use(xss()); // Sanitize data against XSS

// CORS configuration (centralized) with dynamic origin management
const corsManager = require('./utils/corsManager');

// INTERNAL API key for protected internal endpoints (manage origins)
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || null;

// Initialize corsManager from env var
corsManager.init(process.env.CORS_ORIGIN || '*').then(list => {
  console.log('corsManager initialized with origins:', list);
}).catch(err => console.warn('corsManager init failed', err && err.message));

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow non-browser requests (tools, server-to-server) when origin is undefined
      if (!origin) return callback(null, true);
      const allowed = corsManager.getOrigins();
      if (allowed.indexOf('*') !== -1) return callback(null, true);
      if (allowed.indexOf(origin) !== -1) return callback(null, true);
      return callback(new Error('CORS policy: Origin not allowed'));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "ngrok-skip-browser-warning", "X-CSRF-Token"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Internal endpoints to manage allowed origins (protected by INTERNAL_API_KEY)
const internalRouter = express.Router();
internalRouter.use(express.json());

function requireInternalKey(req, res, next) {
  const key = req.headers['x-internal-secret'] || req.query.internal_key || req.body.internal_key;
  if (!INTERNAL_API_KEY) return res.status(403).json({ error: 'Internal API not configured' });
  if (!key || key !== INTERNAL_API_KEY) return res.status(403).json({ error: 'Forbidden' });
  return next();
}

internalRouter.use(requireInternalKey);

internalRouter.get('/cors-origins', (req, res) => {
  res.json({ origins: corsManager.getOrigins() });
});

internalRouter.post('/cors-origins', async (req, res) => {
  const { origin } = req.body;
  if (!origin) return res.status(400).json({ error: 'origin required' });
  const ok = await corsManager.addOrigin(origin);
  return res.status(ok ? 200 : 500).json({ ok, origins: corsManager.getOrigins() });
});

internalRouter.delete('/cors-origins', async (req, res) => {
  const origin = req.body.origin || req.query.origin;
  if (!origin) return res.status(400).json({ error: 'origin required' });
  const ok = await corsManager.removeOrigin(origin);
  return res.status(ok ? 200 : 404).json({ ok, origins: corsManager.getOrigins() });
});

app.use('/internal', internalRouter);

// Trust proxy (for rate limiting behind reverse proxy)
app.set("trust proxy", 1);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});
const allowedOrigins = ["http://localhost:3000", "https://yourdomain.com"];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Health check and custom routes (no auth required)
app.use("/", routes);

// Register cache invalidation endpoints
createCacheInvalidationEndpoint(app);

// Global rate limiter (applied to all proxied routes)
app.use("/api", limiter);

/**
 * Service Proxies with Subscription & Access Control
 * 
 * Protection Stack:
 * 1. authenticateToken - JWT validation
 * 2. checkSubscriptionStatus - Company has active subscription
 * 3. checkFeatureAccess - Feature enabled for tier
 * 4. checkRateLimits - Within tier rate limits
 */
app.use("/api/auth", authLimiter, authProxy);

// Protected services (require authentication - enforced by services themselves)
app.use("/api/company", companyProxy);
app.use("/api/shop", shopProxy);
app.use("/api/inventory", inventoryProxy);
app.use("/api/sales", salesProxy);
app.use("/api/payment", paymentProxy);
app.use("/api/ecommerce", ecommerceProxy);
app.use("/api/notification", notificationProxy);
app.use("/api/analytics", analyticsProxy);
app.use("/api/audit", auditProxy);
app.use("/api/debt", debtProxy);

// Socket.IO specific routes (add these before other websocket routes)
app.use("/socket.io", websocketProxy);

// General websocket routes
app.use("/api/websocket", websocketProxy);
/**
these routes will be applied when uncommented during freemium implementation
* app.use("/api/auth", authLimiter, authProxy);

// Protected services (require authentication - enforced by services themselves)
app.use("/api/company", companyProxy);
app.use("/api/shop", shopProxy);
app.use("/api/inventory", inventoryProxy);
app.use("/api/sales", salesProxy);
app.use("/api/payment", paymentProxy);
app.use("/api/ecommerce", ecommerceProxy);
app.use("/api/notification", notificationProxy);
app.use("/api/analytics", analyticsProxy);
app.use("/api/audit", auditProxy);
app.use("/api/debt", debtProxy);

// Socket.IO specific routes (add these before other websocket routes)
app.use("/socket.io", websocketProxy);

// General websocket routes
app.use("/api/websocket", websocketProxy);

*/
app.use("/api/auth", authLimiter, authProxy);

// Protected services (require authentication - enforced by services themselves)
app.use("/api/company", companyProxy);
app.use("/api/shop", shopProxy);
app.use("/api/inventory", inventoryProxy);
app.use("/api/sales", salesProxy);
app.use("/api/payment", paymentProxy);
app.use("/api/ecommerce", ecommerceProxy);
app.use("/api/notification", notificationProxy);
app.use("/api/analytics", analyticsProxy);
app.use("/api/audit", auditProxy);
app.use("/api/debt", debtProxy);

// Socket.IO specific routes (add these before other websocket routes)
app.use("/socket.io", websocketProxy);

// General websocket routes
app.use("/api/websocket", websocketProxy);

// Auth service (public routes, no subscription check needed)
// app.use("/api/auth", authLimiter, authProxy);

// // ============================================================================
// // COMPANY SERVICE - /api/company/*
// // ============================================================================
// // Features: Company management, roles, subscriptions
// // Protection: All operations require active subscription
// app.use("/api/company",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   checkFeatureAccess("staffManagement", "manageRoles"),
//   companyProxy
// );

// // ============================================================================
// // SHOP SERVICE - /api/shop/*
// // ============================================================================
// // Features: Single shop (basic), multi-shop (mid+)
// // Protection: Multi-shop requires mid tier minimum
// app.use("/api/shop",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   shopProxy  // Shop service applies tier checks internally
// );

// // ============================================================================
// // INVENTORY SERVICE - /api/inventory/*
// // ============================================================================
// // Features: Stock in/out, reporting (all tiers)
// // Protection: Basic subscription + feature access
// app.use("/api/inventory",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   checkFeatureAccess("inventory", "stockInOut"),
//   inventoryProxy
// );

// // ============================================================================
// // SALES SERVICE - /api/sales/*
// // ============================================================================
// // Routes:
// // - POST /receipts          (basic+) - checkFeatureAccess('sales', 'receipts')
// // - POST /invoices          (pro)    - checkFeatureAccess('sales', 'invoicing')
// // - GET  /reports           (basic+) - checkFeatureAccess('sales', 'internalSales')
// // Protection: Subscription + tier-based feature access
// app.use("/api/sales",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   salesProxy  // Sales service applies feature checks per endpoint
// );

// // ============================================================================
// // PAYMENT SERVICE - /api/payment/*
// // ============================================================================
// // Routes:
// // - POST /process           (basic+) - Internal payments
// // - POST /ecommerce/pay     (pro)    - E-commerce payments
// // Protection: Basic (internal), Pro (e-commerce)
// app.use("/api/payment",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   paymentProxy  // Payment service applies tier checks
// );

// // ============================================================================
// // ECOMMERCE SERVICE - /api/ecommerce/*
// // ============================================================================
// // Routes:
// // - GET  /products          (pro) - checkFeatureAccess('ecommerce', 'browse')
// // - GET  /search            (pro) - checkFeatureAccess('ecommerce', 'search')
// // - POST /checkout          (pro) - checkFeatureAccess('ecommerce', 'checkout')
// // Protection: Pro tier only
// app.use("/api/ecommerce",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   checkSubscriptionTier('pro'),
//   checkFeatureAccess("ecommerce", "browse"),
//   ecommerceProxy
// );

// // ============================================================================
// // NOTIFICATION SERVICE - /api/notification/*
// // ============================================================================
// // Features: In-app, email, SMS (all tiers)
// // Protection: Basic subscription
// app.use("/api/notification",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   notificationProxy  // Handles tier-specific limits
// );

// // ============================================================================
// // ANALYTICS SERVICE - /api/analytics/*
// // ============================================================================
// // Routes:
// // - GET  /summary           (basic+) - checkFeatureAccess('analytics', 'basicSummary')
// // - GET  /dashboard         (pro)    - checkFeatureAccess('analytics', 'fullDashboards')
// // Protection: Subscription + feature-based
// app.use("/api/analytics",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   analyticsProxy  // Handles feature checks per endpoint
// );

// // ============================================================================
// // AUDIT SERVICE - /api/audit/*
// // ============================================================================
// // Features: Audit logs (all tiers)
// // Protection: Basic subscription
// app.use("/api/audit",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   auditProxy
// );

// // ============================================================================
// // DEBT SERVICE - /api/debt/*
// // ============================================================================
// // Routes:
// // - POST /record            (mid+) - checkFeatureAccess('debt', 'record')
// // - GET  /track             (mid+) - checkFeatureAccess('debt', 'track')
// // - GET  /reports           (mid+) - checkFeatureAccess('debt', 'reports')
// // Protection: Mid tier minimum
// app.use("/api/debt",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   checkSubscriptionTier('mid'),
//   checkFeatureAccess("debt", "record"),
//   debtProxy
// );

// // ============================================================================
// // WEBSOCKET SERVICE - /api/websocket/* and /socket.io/*
// // ============================================================================
// // Features: Real-time updates (all tiers)
// // Protection: Basic subscription
// app.use("/api/websocket",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   websocketProxy
// );

// // Socket.IO specific routes (add these before other websocket routes)
// app.use("/socket.io",
//   authenticateToken,
//   checkSubscriptionStatus(),
//   websocketProxy
// );

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Invexis API Gateway",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/health",
      healthAll: "/health/all",
      auth: "/api/auth",
      company: "/api/company",
      shop: "/api/shop",
      inventory: "/api/inventory",
      sales: "/api/sales",
      payment: "/api/payment",
      ecommerce: "/api/ecommerce",
      notification: "/api/notification",
      analytics: "/api/analytics",
      audit: "/api/audit",
      debt: "/api/debt",
      websocket: "/api/websocket",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Gateway Error:", err.message);
  console.error(err.stack);

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
});

// Initialize subscription event consumer (async)
setImmediate(async () => {
  try {
    await initSubscriptionEventConsumer();
  } catch (error) {
    console.error("⚠️ Event consumer initialization failed:", error.message);
  }
});

module.exports = app;
