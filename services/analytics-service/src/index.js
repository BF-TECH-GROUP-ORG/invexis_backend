require('dotenv').config();
const express = require('express');
const { getLogger } = require('/app/shared/logger');
const HealthChecker = require('/app/shared/health');
const { SecurityManager } = require('/app/shared/security');
const { ErrorHandler } = require('/app/shared/errorHandler');
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");

// Local imports
const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const sequelize = require("./config/database");

const app = express();
const PORT = process.env.PORT || 8002;
const SERVICE_NAME = 'analytics-service';

// Initialize production modules
const logger = getLogger(SERVICE_NAME);
const healthChecker = new HealthChecker(SERVICE_NAME, {
    postgresql: true,
    redis: true,
    rabbitmq: true,
    timeout: 5000
});
const security = new SecurityManager(SERVICE_NAME);
const errorHandler = new ErrorHandler(SERVICE_NAME);

// Request parsing
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));


// Setup security middleware
security.setupSecurity(app);

// Request logging
app.use(logger.requestLogger());

// Health check routes
healthChecker.setupRoutes(app);

// Routes
app.use("/analytics", require("./routes/AnalyticsRoutes"));

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: SERVICE_NAME,
        status: 'running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Initialize Database (Postgres/Sequelize)
// Load all models
require("./models");

const initializeDatabase = async () => {
    try {
        await sequelize.authenticate();
        logger.info("✅ Database connection established");

        // Sync models
        await sequelize.sync({force: false });
        logger.info("✅ Database models synchronized");

        // Skip TimescaleDB hypertable setup in development (tables work as regular Postgres tables)
        if (process.env.NODE_ENV === 'production') {
            // Check for TimescaleDB extension (production only)
            try {
                await sequelize.query("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;");
                logger.info("✅ TimescaleDB extension verified");
            } catch (err) {
                logger.warn("⚠️ TimescaleDB extension check failed (might already exist):", err.message);
            }

            // 1. Convert to Hypertable: Analytics Events (Raw)
            try {
                await sequelize.query("SELECT create_hypertable('analytics_events', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
                logger.info("✅ Hypertable 'analytics_events' ready");
            } catch (err) {
                logger.warn("⚠️ Hypertable 'analytics_events' creation skipped/failed:", err.message);
            }

            // 2. Convert to Hypertable: Sales Metrics
            try {
                await sequelize.query("SELECT create_hypertable('sales_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
                logger.info("✅ Hypertable 'sales_metrics' ready");
            } catch (err) {
                logger.warn("⚠️ Hypertable 'sales_metrics' creation skipped/failed:", err.message);
            }

            // 3. Convert to Hypertable: Inventory Metrics
            try {
                await sequelize.query("SELECT create_hypertable('inventory_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
                logger.info("✅ Hypertable 'inventory_metrics' ready");
            } catch (err) {
                logger.warn("⚠️ Hypertable 'inventory_metrics' creation skipped/failed:", err.message);
            }

            // 4. Convert to Hypertable: Sales Item Metrics (Detailed)
            try {
                await sequelize.query("SELECT create_hypertable('sales_item_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
                logger.info("✅ Hypertable 'sales_item_metrics' ready");
            } catch (err) {
                logger.warn("⚠️ Hypertable 'sales_item_metrics' creation skipped/failed:", err.message);
            }
        } else {
            logger.debug("⏭️ Skipping TimescaleDB hypertable setup in development (using regular Postgres tables)");
        }

    } catch (error) {
        logger.error("❌ Database initialization failed:", error);
        throw error;
    }
};

// Initialize Event System
const initializeEventSystem = async () => {
    try {
        await connectRabbitMQ();
        await initPublishers();
        await consumeEvents();
        startOutboxDispatcher();
        logger.info("✅ Event system initialized");
    } catch (error) {
        logger.error("❌ Failed to initialize event system:", error);
    }
};

// Error handling
errorHandler.setupErrorHandlers(app);

// Start server
const startServer = async () => {
    try {
        await initializeDatabase();
        await initializeEventSystem();

        const server = app.listen(PORT, () => {
            logger.info('Analytics Service started successfully', {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                pid: process.pid
            });
            console.log(`🚀 Analytics Service running on port ${PORT}`);
        });

        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, starting graceful shutdown`);

            server.close(async (err) => {
                if (err) {
                    logger.error('Error closing server', { error: err.message });
                    process.exit(1);
                }

                logger.info('Analytics Service shutdown completed');
                process.exit(0);
            });

            // Force close after 30 seconds
            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        logger.error("Failed to start server:", error);
        process.exit(1);
    }
};

if (require.main === module) {
    startServer();
}

module.exports = app;
