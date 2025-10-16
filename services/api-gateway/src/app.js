const express = require('express');
const cors = require('cors');
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
} = require('./routes/proxy');
const { limiter, authLimiter } = require('./utils/rateLimiter');

// Global error handling (from reference)
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
};

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.set('trust proxy', 1);  // From reference

app.use(express.json({ limit: '10mb' }));  // Parse JSON bodies

// Use custom routes (e.g., /api/user/:userId)
app.use('/', routes);

// Global limiter
app.use(limiter);

// Proxy Routes (with auth where needed, like reference)
app.use('/api/auth', authLimiter, authProxy);
app.use('/api/company', companyProxy);
app.use('/api/shop', shopProxy);
app.use('/api/inventory', inventoryProxy);
app.use('/api/sales', salesProxy);
app.use('/api/payment', paymentProxy);
app.use('/api/ecommerce', ecommerceProxy);
app.use('/api/notification', notificationProxy);
app.use('/api/analytics', analyticsProxy);
app.use('/api/audit', auditProxy);
app.use('/api/debt', debtProxy);
app.use('/api/websocket', websocketProxy); 

app.get('/', (req, res) => {
    res.send('API Gateway is running...');
});

app.use(errorHandler);

module.exports = app;