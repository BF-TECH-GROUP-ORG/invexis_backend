require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connect: connectRabbitMQ } = require("/app/shared/rabbitmq");

const { initPublishers } = require("./events/producer");
const consumeEvents = require("./events/consumer");
const { startOutboxDispatcher } = require("./workers/outboxDispatcher");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 8003; // Default to 9003 for audit (as per docker-compose)

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
        service: "audit-service",
        timestamp: new Date().toISOString(),
    });
});

// API Routes
app.use("/audit", require("./routes/AuditRoutes"));

// 404 handler
app.use((req, res) => {
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

// Initialize Database (MongoDB)
const initializeDatabase = async () => {
    try {
        // Default to Docker Compose value
        const mongoUri = process.env.DB_MONGO || "mongodb://root:invexispass@mongodb:27017/auditdb?authSource=admin";
        await mongoose.connect(mongoUri);
        console.log("✅ MongoDB connected");
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error);
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
        console.log(`🚀 Audit Service running on port ${PORT}`);
    });
};

if (require.main === module) {
    startServer();
}

module.exports = app;
