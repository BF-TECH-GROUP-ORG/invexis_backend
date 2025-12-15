const { createProxyMiddleware } = require("http-proxy-middleware");
const services = require("../../config/services");
// Import shared production auth middleware
const { authenticateToken } = require("/app/shared/middlewares/auth/production-auth");
const { authLimiter } = require("../utils/rateLimiter");
const { Router } = require("express");
const routes = Router();

/**
 * Common proxy configuration
 */
const createServiceProxy = (serviceName, serviceUrl, options = {}) => {
  return createProxyMiddleware({
    target: serviceUrl,
    changeOrigin: true,
    pathRewrite: options.pathRewrite || {},
    onProxyReq: (proxyReq, req) => {
      console.log(
        `🔀 [${serviceName}] ${req.method} ${req.originalUrl} → ${serviceUrl}${req.url}`
      );

      // Add gateway identification header for service trust
      proxyReq.setHeader("X-Gateway-Request", "true");
      proxyReq.setHeader("X-Gateway-Service", serviceName);
      
      // Forward user info from auth middleware if available
      if (req.user) {
        proxyReq.setHeader("X-User-Id", req.user.id);
        proxyReq.setHeader("X-User-Email", req.user.email);
        proxyReq.setHeader("X-User-Role", req.user.role);
<<<<<<< HEAD
        if (req.user.companies) proxyReq.setHeader("X-User-Companies", JSON.stringify(req.user.companies));
        if (req.user.shops) proxyReq.setHeader("X-User-Shops", JSON.stringify(req.user.shops));
=======
        proxyReq.setHeader("X-Company-Id", req.user.companyId || "");
>>>>>>> 883577be20e1755361bcb2d32d7d151da987ea2f
      }

      // Handle body for POST/PUT/PATCH
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(
        `✅ [${serviceName}] ${proxyRes.statusCode} ${req.method} ${req.originalUrl}`
      );

      // Ensure Set-Cookie from backend is scoped to the gateway host
      try {
        const setCookie = proxyRes.headers && proxyRes.headers['set-cookie'];
        if (setCookie && Array.isArray(setCookie) && setCookie.length) {
          // Remove any Domain attribute so cookie is issued for gateway host
          const rewritten = setCookie.map((c) => c.replace(/;?\s*Domain=[^;]+/i, ''));
          // Replace on the proxy response so downstream receives rewritten cookies
          proxyRes.headers['set-cookie'] = rewritten;
        }
      } catch (e) {
        // don't break proxy on header rewrite errors
        console.warn('Cookie rewrite failed:', e && e.message);
      }
    },
    onError: (err, req, res) => {
      console.error(`[${serviceName}] Proxy error:`, err.message);
      res.status(502).json({
        error: `${serviceName} unavailable`,
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    },
    ...options,
  });
};

/**
 * Gateway Health Check
 */
routes.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "api-gateway",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Aggregated Health Check
 * Checks health of all backend services
 */
routes.get("/health/all", async (req, res) => {
  const axios = require("axios");
  const healthChecks = {};

  const checkService = async (name, url) => {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 3000 });
      return { status: "healthy", ...response.data };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
      };
    }
  };

  // Check all services in parallel
  const checks = await Promise.allSettled([
    checkService("auth", services.AUTH_SERVICE),
    checkService("company", services.COMPANY_SERVICE),
    checkService("shop", services.SHOP_SERVICE),
    checkService("inventory", services.INVENTORY_SERVICE),
    checkService("sales", services.SALES_SERVICE),
    checkService("payment", services.PAYMENT_SERVICE),
    checkService("ecommerce", services.ECOMMERCE_SERVICE),
    checkService("notification", services.NOTIFICATION_SERVICE),
    checkService("analytics", services.ANALYTICS_SERVICE),
    checkService("audit", services.AUDIT_SERVICE),
    checkService("debt", services.DEBT_SERVICE),
    checkService("websocket", services.WEBSOCKET_SERVICE),
  ]);

  const serviceNames = [
    "auth",
    "company",
    "shop",
    "inventory",
    "sales",
    "payment",
    "ecommerce",
    "notification",
    "analytics",
    "audit",
    "debt",
    "websocket",
  ];

  checks.forEach((result, index) => {
    healthChecks[serviceNames[index]] =
      result.status === "fulfilled" ? result.value : { status: "error" };
  });

  const allHealthy = Object.values(healthChecks).every(
    (check) => check.status === "healthy"
  );

  res.status(allHealthy ? 200 : 503).json({
    gateway: "healthy",
    services: healthChecks,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Auth Service Proxy
 * Routes: /api/auth/* → http://auth-service:8001/*
 * No path rewrite needed - auth service handles /auth routes internally
 */
const authProxy = createServiceProxy("AUTH", services.AUTH_SERVICE, {
  pathRewrite: { "^/api/auth": "/auth" },
});

/**
 * Company Service Proxy
 * Routes: /api/company/* → http://company-service:8004/*
 * Exposes: /companies, /roles, /company-users, /subscriptions
 */
const companyProxy = createServiceProxy("COMPANY", services.COMPANY_SERVICE, {
  pathRewrite: { "^/api/company": "/company" },
});

/**
 * Shop Service Proxy
 * Routes: /api/shop/* → http://shop-service:9001/*
 * Exposes: / (shop CRUD), /:shopId/departments
 */
const shopProxy = createServiceProxy("SHOP", services.SHOP_SERVICE, {
  pathRewrite: { "^/api/shop": "/shop" },
});

/**
 * Inventory Service Proxy
 * Routes: /api/inventory/* → http://inventory-service:8007/*
 * Exposes: /v1/products, /v1/stock-changes, /v1/discounts, /v1/alerts, etc.
 */
const inventoryProxy = createServiceProxy(
  "INVENTORY",
  services.INVENTORY_SERVICE,
  {
    pathRewrite: { "^/api/inventory": "/inventory" },
  }
);

/**
 * Sales Service Proxy
 * Routes: /api/sales/* → http://sales-service:9000/*
 * Exposes: /sales, /invoices
 */
const salesProxy = createServiceProxy("SALES", services.SALES_SERVICE, {
  pathRewrite: { "^/api/sales": "/sales" },
});

/**
 * Payment Service Proxy
 * Routes: /api/payment/* → http://payment-service:8009/*
 */
const paymentProxy = createServiceProxy("PAYMENT", services.PAYMENT_SERVICE, {
  pathRewrite: { "^/api/payment": "/payment" },
});

/**
 * E-commerce Service Proxy
 * Routes: /api/ecommerce/* → http://ecommerce-service:8006/*
 * Exposes: /cart, /products (catalog)
 */
const ecommerceProxy = createServiceProxy(
  "ECOMMERCE",
  services.ECOMMERCE_SERVICE,
  {
    pathRewrite: { "^/api/ecommerce": "/ecommerce" },
  }
);

/**
 * Notification Service Proxy
 * Routes: /api/notification/* → http://notification-service:8008/*
 */
const notificationProxy = createServiceProxy(
  "NOTIFICATION",
  services.NOTIFICATION_SERVICE,
  {
    pathRewrite: { "^/api/notification": "/notification" },
  }
);

/**
 * Analytics Service Proxy
 * Routes: /api/analytics/* → http://analytics-service:8002/*
 */
const analyticsProxy = createServiceProxy(
  "ANALYTICS",
  services.ANALYTICS_SERVICE,
  {
    pathRewrite: { "^/api/analytics": "/analytics" },
  }
);

/**
 * Audit Service Proxy
 * Routes: /api/audit/* → http://audit-service:8003/*
 */
const auditProxy = createServiceProxy("AUDIT", services.AUDIT_SERVICE, {
  pathRewrite: { "^/api/audit": "/audit" },
});

/**
 * Debt Service Proxy
 * Routes: /api/debt/* → http://debt-service:8005/*
 */
const debtProxy = createServiceProxy("DEBT", services.DEBT_SERVICE, {
  pathRewrite: { "^/api/debt": "/debt" },
});

/**
 * WebSocket Service Proxy
 * Routes: /api/websocket/* → http://websocket-service:9002/*
 * Supports WebSocket upgrade
 */
const websocketProxy = createServiceProxy(
  "WEBSOCKET",
  services.WEBSOCKET_SERVICE,
  {
    pathRewrite: { "^/api/websocket": "" }, // Remove the prefix completely
    ws: true, // Enable WebSocket support
    changeOrigin: true,
    // Add specific handling for Socket.IO
    onProxyReq: (proxyReq, req, res) => {
      console.log(`🔀 [WEBSOCKET] ${req.method} ${req.originalUrl} → ${services.WEBSOCKET_SERVICE}${req.url}`);

      // Forward user info if available
      if (req.user) {
        proxyReq.setHeader("X-User-Id", req.user.id);
        proxyReq.setHeader("X-User-Email", req.user.email);
        proxyReq.setHeader("X-User-Role", req.user.role);
      }
    }
  }
);

// Export proxies and routes for app.js
module.exports = {
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
  authenticateToken, // For custom routes
};
