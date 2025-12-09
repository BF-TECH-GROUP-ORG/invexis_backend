require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");

const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const sequelize = require("./config/database");

const app = express();
const PORT = process.env.PORT || 9002; // Default to 9002 for analytics

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

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

// API Routes
app.use("/api/analytics", require("./routes/AnalyticsRoutes"));

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
        // In production, use migrations. For dev/setup, sync is fine.
        await sequelize.sync({ alter: true });
        console.log("✅ Database models synchronized");

        // Check for TimescaleDB extension and create hypertable
        try {
            await sequelize.query("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;");
            console.log("✅ TimescaleDB extension verified");

            // Create hypertable for analytics_events
            // We need to Convert the table to a hypertable. 
            // Note: This throws an error if it's already a hypertable, so we wrap it or check first.
            // A simple way is to catch the specific error "table ... is already a hypertable"

            try {
                await sequelize.query("SELECT create_hypertable('analytics_events', 'time', if_not_exists => TRUE);");
                console.log("✅ 'analytics_events' converted to hypertable");
            } catch (htError) {
                // Ignore if it says it is already a hypertable (though if_not_exists should handle it)
                console.log("ℹ️ Hypertable check:", htError.message);
            }

        } catch (err) {
            console.warn("⚠️ Could not create TimescaleDB extension (might strictly need superuser, or already exists, or not using Timescale image):", err.message);
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
