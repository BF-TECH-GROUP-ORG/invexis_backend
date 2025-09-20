const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_MONGO, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    setTimeout(connectDB, 5000); // Retry after 5s
  }
};

module.exports = connectDB;