const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_MONGO, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('MongoDB connection failed:', err);
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

module.exports = { connectDB };