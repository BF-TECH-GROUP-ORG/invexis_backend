const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const productRoutes = require('./routes/productRoutes');
const reportRoutes = require('./routes/reportRoute');
const { logger } = require('./utils/logger');
const errorMiddleware = require('./middleware/error');
require('dotenv').config();

const app = express();

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));

app.use('/api/v1/products', productRoutes);
app.use('/api/v1/reports', reportRoutes);

app.use('*', (req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorMiddleware);

module.exports = { app, logger };