const { createProxyMiddleware } = require('http-proxy-middleware');
const services = require('../../config/services');

module.exports = (app) => {

    app.use('/auth', createProxyMiddleware({ target: services.AUTH_SERVICE, changeOrigin: true }));
    app.use('/company', createProxyMiddleware({ target: services.COMPANY_SERVICE, changeOrigin: true }));
    app.use('/shop', createProxyMiddleware({ target: services.SHOP_SERVICE, changeOrigin: true }));
    app.use('/inventory', createProxyMiddleware({ target: services.INVENTORY_SERVICE, changeOrigin: true }));
    app.use('/payment', createProxyMiddleware({ target: services.PAYMENT_SERVICE, changeOrigin: true }));
    app.use('/sales', createProxyMiddleware({ target: services.SALES_SERVICE, changeOrigin: true }));
    app.use('/analytics', createProxyMiddleware({ target: services.ANALYTICS_SERVICE, changeOrigin: true }));
    app.use('/audit', createProxyMiddleware({ target: services.AUDIT_SERVICE, changeOrigin: true }));
    app.use('/notification', createProxyMiddleware({ target: services.NOTIFICATION_SERVICE, changeOrigin: true }));

}