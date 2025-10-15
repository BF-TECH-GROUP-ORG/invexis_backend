// index.js (Updated with RabbitMQ Connection Init)
const app = require('./app');
const connectDB = require('./config/db');

// Shared RabbitMQ Module
const { connect: connectRabbitMQ } = require('/app/shared/rabbitmq.js');

const PORT = process.env.PORT || 3001;  // Default to 3001 for auth-service

const startServer = async () => {
    try {
        // Connect to MongoDB (unchanged)
        await connectDB();

        // Connect to RabbitMQ using shared module
        try {
            await connectRabbitMQ();
            console.log('Auth-service: RabbitMQ connected via shared module');
        } catch (rabbitErr) {
            console.error('Auth-service: RabbitMQ connection failed:', rabbitErr.message);
            // Don't exit on RabbitMQ failure (non-critical for startup, but monitor)
        }

        // Start Express server
        app.listen(PORT, () => {
            console.log(`Auth-service running on port ${PORT}`);
        });

    } catch (error) {
        console.error('Auth-service startup error:', error.message);
        process.exit(1);
    }
};

startServer();

// Graceful shutdown (enhanced to include shared modules)
process.on('SIGINT', async () => {
    console.log('Auth-service: Received SIGINT, shutting down gracefully...');
    // Redis close handled in shared module
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Auth-service: Received SIGTERM, shutting down gracefully...');
    // Redis close handled in shared module
    process.exit(0);
});