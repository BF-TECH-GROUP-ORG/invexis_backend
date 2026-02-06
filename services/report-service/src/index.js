require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const apiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(require('compression')()); // GZIP Compression for ultra-fast large JSON responses

const { initRabbitMQ } = require('./config/rabbitmq');
const registerConsumers = require('./events/consumer');

// Database Connection
connectDB();

// Initialize Event Bus & Scheduled Worker
const startBackgroundWorkers = async () => {
    try {
        await initRabbitMQ(); // Connect
        await registerConsumers(); // Subscribe

        const scheduledReportWorker = require('./workers/scheduledReportWorker');
        scheduledReportWorker.start();
        console.log("✅ Background Workers Initialized");
    } catch (err) {
        console.error("❌ Background Worker initialization failed:", err);
    }
};
startBackgroundWorkers();

// Routes
const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');
const { checkSubscriptionStatus } = require('/app/shared/middlewares/subscription/production-subscription');

app.use('/report', authenticateToken, checkSubscriptionStatus(), apiRoutes);

// Health Check
app.get('/health', (req, res) => res.json({ status: 'OK', service: 'Report Service' }));

const PORT = process.env.PORT || 9003;

app.listen(PORT, () => {
    console.log(`🚀 Report Service running on port ${PORT}`);
    console.log(`📊 Mode: Event-Driven Data Warehouse`);
});
