require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");

const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const AnalyticsEvent = require("./models/AnalyticsEvent.model");
const SalesMetric = require("./models/SalesMetric.model");
const InventoryMetric = require("./models/InventoryMetric.model");
const Outbox = require("./models/outbox.model");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const sequelize = require("./config/database");

const app = express();
const PORT = process.env.PORT || 8002; // Default to 9002 for analytics

// ✅ Trust proxy - Required for rate limiting behind API gateway
app.set('trust proxy', true);

// Middleware
app.use(express.json());
app.use(cors());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        service: "analytics-service",
        timestamp: new Date().toISOString(),
    });
});

// API Routes
app.use("/", require("./routes/AnalyticsRoutes"));

// 404 handler (must be after routes)
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    res.status(500).json({
        success: false,
        message: err.message,
    });
});

// Initialize Database (Postgres/Sequelize)
const initializeDatabase = async () => {
    try {
        await sequelize.authenticate();
        console.log("✅ Database connection established");

        // Sync models
        // Sync models
        // Disable alter: true as it is unsafe for Hypertables/Views
        await sequelize.sync({ force: false });
        console.log("✅ Database models synchronized");

        // Check for TimescaleDB extension
        try {
            await sequelize.query("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;");
            console.log("✅ TimescaleDB extension verified");
        } catch (err) {
            console.warn("⚠️ TimescaleDB extension check failed (might already exist):", err.message);
        }

        // 1. Convert to Hypertable: Analytics Events (Raw)
        try {
            await sequelize.query("SELECT create_hypertable('analytics_events', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
            console.log("✅ Hypertable 'analytics_events' ready");
        } catch (err) {
            console.warn("⚠️ Hypertable 'analytics_events' creation skipped/failed:", err.message);
        }

        // 2. Convert to Hypertable: Sales Metrics
        try {
            await sequelize.query("SELECT create_hypertable('sales_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
            console.log("✅ Hypertable 'sales_metrics' ready");
        } catch (err) {
            console.warn("⚠️ Hypertable 'sales_metrics' creation skipped/failed:", err.message);
        }

        // 3. Convert to Hypertable: Inventory Metrics
        try {
            await sequelize.query("SELECT create_hypertable('inventory_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
            console.log("✅ Hypertable 'inventory_metrics' ready");
        } catch (err) {
            console.warn("⚠️ Hypertable 'inventory_metrics' creation skipped/failed:", err.message);
        }

        // 4. Create Continuous Aggregates (Materialized Views)
        try {
            // Daily Sales Summary
            await sequelize.query(`
                CREATE MATERIALIZED VIEW IF NOT EXISTS sales_daily_summary
                WITH (timescaledb.continuous) AS
                SELECT 
                    time_bucket('1 day', time) AS bucket,
                    "companyId",
                    "shopId",
                    SUM(amount) as total_revenue,
                    SUM("itemCount") as total_items,
                    COUNT(*) as total_orders
                FROM sales_metrics
                GROUP BY bucket, "companyId", "shopId"
                WITH NO DATA;
            `);

            // Add Refresh Policy
            try {
                await sequelize.query(`
                    SELECT add_continuous_aggregate_policy('sales_daily_summary',
                        start_offset => INTERVAL '1 month',
                        end_offset => INTERVAL '1 hour',
                        schedule_interval => INTERVAL '1 hour');
                `);
            } catch (policyErr) {
                // Ignore if policy already exists
            }
            console.log("✅ Continuous Aggregate 'sales_daily_summary' ready");

        } catch (err) {
            console.error("❌ Failed to create continuous aggregates:", err.message);
        }

    } catch (error) {
        console.error("❌ Database connection failed:", error);
        process.exit(1);
    }
};

// Initialize Event System
const initializeEventSystem = async () => {
    try {
        await connectRabbitMQ();
        await consumeEvents();
        await initPublishers();
        await startOutboxDispatcher(5000);
        console.log("✅ Event system initialized");
    } catch (error) {
        console.error("❌ Failed to initialize event system:", error);
    }
};

const startServer = async () => {
    await initializeDatabase();
    await initializeEventSystem();
    app.listen(PORT, () => {
        console.log(`🚀 Analytics Service running on port ${PORT}`);
    });
};

if (require.main === module) {
    startServer();
}

module.exports = app;
