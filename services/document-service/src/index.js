require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const mongoose = require('mongoose');
const { startConsumer } = require('./events/consumer');
const rabbitmq = require('/app/shared/rabbitmq.js');

const PORT = process.env.PORT || 9004;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/invexis_document')
    .then(async () => {
        logger.info('Connected to MongoDB');

        // Initialize RabbitMQ
        await rabbitmq.connect();
        logger.info('✅ RabbitMQ connected');

        // Start Event Consumer
        await startConsumer();

        // Start server
        const server = app.listen(PORT, () => {
            logger.info(`Document Service running on port ${PORT}`);
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
