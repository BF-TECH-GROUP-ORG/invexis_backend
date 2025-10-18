module.exports = {
    AUTH_SERVICE: process.env.AUTH_SERVICE_URL || 'http://auth-service:8001',
    COMPANY_SERVICE: process.env.COMPANY_SERVICE_URL || 'http://company-service:8004',
    SHOP_SERVICE: process.env.SHOP_SERVICE_URL || 'http://shop-service:9001',
    INVENTORY_SERVICE: process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8007',
    SALES_SERVICE: process.env.SALES_SERVICE_URL || 'http://sales-service:9000',
    PAYMENT_SERVICE: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8009',
    ECOMMERCE_SERVICE: process.env.ECOMMERCE_SERVICE_URL || 'http://ecommerce-service:8006',
    ANALYTICS_SERVICE: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8002',
    AUDIT_SERVICE: process.env.AUDIT_SERVICE_URL || 'http://audit-service:8003',
    NOTIFICATION_SERVICE: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8008',
    DEBT_SERVICE: process.env.DEBT_SERVICE_URL || 'http://debt-service:8005',
    WEBSOCKET_SERVICE: process.env.WEBSOCKET_SERVICE_URL || 'http://websocket-service:9002',
};