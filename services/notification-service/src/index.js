const express = require('express');
const app = express();
const PORT = process.env.PORT || 8008;
const router = require('./routes/notification')
// in notification-service app
app.get('/health', (req, res) => res.sendStatus(200));
app.use('/notification', router)
app.listen(PORT, () => console.log(`notification-service running on port ${PORT}`));
// src/index.js
require('dotenv').config();
const express = require('express');
const connectDB = require('./config/database');
const { connectRabbitMQ } = require('./config/rabbitmq');
const notificationQueue = require('./config/queue');
const { startConsumers } = require('./consumers/generalConsumer');
const healthRoutes = require('./controllers/health');
const testRoutes = require('./controllers/test');
const notificationRoutes = require('./controllers/notifications');
const logger = require('./utils/logger');

app.use('/health', healthRoutes);
app.use('/test', testRoutes);
app.use('/notifications', notificationRoutes);

const start = async () => {
    await connectDB();
    await connectRabbitMQ();
    await startConsumers();

    app.listen(PORT, () => {
        logger.info(`Notification Service running on port ${PORT}`);
    });
};

start().catch((err) => {
    logger.error('Failed to start:', err);
    process.exit(1);
});

process.on('SIGINT', async () => {
    await notificationQueue.close();
    process.exit(0);
});