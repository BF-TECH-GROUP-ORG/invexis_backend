require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const mongoose = require('mongoose');
const { startConsumer } = require('./services/consumerService');
const redis = require('/app/shared/redis.js');
const rabbitmq = require('/app/shared/rabbitmq.js');

const PORT = process.env.PORT || 9003;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        logger.info('Connected to MongoDB')
        console.log(process.env.MONGO_URI)
        // Initialize Redis
        await redis.connect();
        logger.info('✅ Redis connected');

        // Initialize RabbitMQ
        await rabbitmq.connect();
        logger.info('✅ RabbitMQ connected');

        // Start Event Consumer
        await startConsumer();

        // Start server
        const server = app.listen(PORT, () => {
            logger.info(`Report Service running on port ${PORT}`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            server.close(() => {
                logger.info('Process terminated');
                mongoose.connection.close(false, () => {
                    process.exit(0);
                });
            });
        });
    })
    .catch((err) => {
        logger.error('Failed to connect to MongoDB', err);
        process.exit(1);
    });
