const { createProxyMiddleware } = require('http-proxy-middleware');
const services = require('../../config/services');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authLimiter } = require('../utils/rateLimiter');
const { Router } = require('express');
const routes = Router();


// Health check
routes.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Proxy for Auth (with authLimiter, like reference)
const authProxy = createProxyMiddleware({
    target: services.AUTH_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/auth': '/auth' },  // Adapted from reference
    onProxyReq: (proxyReq, req) => {
        console.log(`🚀 Proxying request: ${req.method} ${req.url}`);
        console.log(`📝 Headers:`, req.headers);
        console.log(`📦 Body:`, req.body);
    },
    onError: (err, req, res) => {
        console.error('Auth proxy error:', err);
        res.status(502).json({ error: 'Auth service unavailable' });
    },
});

// Proxies for other services (adapted from wallet/tracking in reference)
const companyProxy = createProxyMiddleware({
    target: services.COMPANY_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/company': '/company' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to company: ${req.method} ${req.url}`);
    },
});

const shopProxy = createProxyMiddleware({
    target: services.SHOP_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/shop': '/shop' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to shop: ${req.method} ${req.url}`);
    },
});

const inventoryProxy = createProxyMiddleware({
    target: services.INVENTORY_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/inventory': '/inventory' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to inventory: ${req.method} ${req.url}`);
    },
});

const salesProxy = createProxyMiddleware({
    target: services.SALES_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/sales': '/sales' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to sales: ${req.method} ${req.url}`);
    },
});

const paymentProxy = createProxyMiddleware({
    target: services.PAYMENT_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/payment': '/payment' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to payment: ${req.method} ${req.url}`);
    },
});

const ecommerceProxy = createProxyMiddleware({
    target: services.ECOMMERCE_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/ecommerce': '/ecommerce' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to ecommerce: ${req.method} ${req.url}`);
    },
});

const notificationProxy = createProxyMiddleware({
    target: services.NOTIFICATION_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/notification': '/notification' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to notification: ${req.method} ${req.url}`);
    },
});

const analyticsProxy = createProxyMiddleware({
    target: services.ANALYTICS_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/analytics': '/analytics' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to analytics: ${req.method} ${req.url}`);
    },
});

const auditProxy = createProxyMiddleware({
    target: services.AUDIT_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/audit': '/audit' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to audit: ${req.method} ${req.url}`);
    },
});

const debtProxy = createProxyMiddleware({
    target: services.DEBT_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/debt': '/debt' },
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to debt: ${req.method} ${req.url}`);
    },
});

const websocketProxy = createProxyMiddleware({
    target: services.WEBSOCKET_SERVICE,
    changeOrigin: true,
    pathRewrite: { '^/api/websocket': '/websocket' },
    ws: true,  // Enable WebSocket support
    onProxyReq: (proxyReq, req) => {
        console.log(`Proxying to websocket: ${req.method} ${req.url}`);
    },
});

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
    authenticateToken,  // For custom routes
};