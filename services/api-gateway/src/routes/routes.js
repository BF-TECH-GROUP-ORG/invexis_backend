const { createProxyMiddleware } = require('http-proxy-middleware');
const services = require('../../config/services');
const { authLimiter } = require('../utils/rateLimiter');

module.exports = (app) => {
    // Sensitive Auth routes with strict limiter
    app.use('/auth/login', authLimiter, createProxyMiddleware({
        target: services.AUTH_SERVICE,
        changeOrigin: true,
    }));

    app.use('/auth/reset-password', authLimiter, createProxyMiddleware({
        target: services.AUTH_SERVICE,
        changeOrigin: true,
    }));

    // Other Auth routes (register, verify-email, etc.) — just proxy
    app.use('/auth', createProxyMiddleware({
        target: services.AUTH_SERVICE,
        changeOrigin: true,
    }));

    // All other microservices — generalLimiter applied globally in app.js
    const servicesList = [
        { path: '/company', target: services.COMPANY_SERVICE },
        { path: '/shop', target: services.SHOP_SERVICE },
        { path: '/inventory', target: services.INVENTORY_SERVICE },
        { path: '/payment', target: services.PAYMENT_SERVICE },
        { path: '/sales', target: services.SALES_SERVICE },
        { path: '/analytics', target: services.ANALYTICS_SERVICE },
        { path: '/audit', target: services.AUDIT_SERVICE },
        { path: '/notification', target: services.NOTIFICATION_SERVICE },
    ];

    servicesList.forEach(service => {
        app.use(service.path, createProxyMiddleware({
            target: service.target,
            changeOrigin: true,
        }));
    });
};
