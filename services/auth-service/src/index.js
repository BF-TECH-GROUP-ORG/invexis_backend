// index.js
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { connect: connectRabbitMQ } = require('/app/shared/rabbitmq.js');
const redis = require('/app/shared/redis.js');

const PORT = process.env.PORT || 8001;

// Validate critical environment variables
const requiredEnvVars = [
    'MONGO_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'SESSION_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'UPLOAD_PATH'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();
        console.log('MongoDB connected');

        // Connect to RabbitMQ
        await connectRabbitMQ();
        console.log('RabbitMQ connected');

        // Connect to Redis
        await redis.connect();
        console.log('Redis connected');

        // Start Express server
        app.listen(PORT, () => {
            console.log(`Auth service running on port ${PORT} - Cached & Event-ready`);
        });
    } catch (error) {
        console.error(`Startup failed: ${error.message}`);
        process.exit(1);
    }
};

// Handle graceful shutdown
const shutdown = async () => {
    console.log('Graceful shutdown initiated...');
    try {
        // Close Redis connection
        await redis.quit();
        console.log('Redis connection closed');

        // Close RabbitMQ connection (assumed handled in /app/shared/rabbitmq.js)
        console.log('Shutting down server');
        process.exit(0);
    } catch (error) {
        console.error(`Shutdown error: ${error.message}`);
        process.exit(1);
    }
};

// Start the server
startServer();

// Listen for termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);