const mongoose = require('mongoose');
const logger = require('../utils/logger');

// ✅ Optimized MongoDB connection with enhanced pool settings
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://root:invexispass@mongodb:27017/inventorydb?authSource=admin', {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 50,           // ✅ Increased from 10 for better concurrency
      minPoolSize: 10,           // ✅ Maintain minimum connections
      maxIdleTimeMS: 30000,      // ✅ Close idle connections after 30s
      waitQueueTimeoutMS: 10000, // ✅ Timeout for waiting in queue
    });
    console.info('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    setTimeout(connectDB, 5000); // Retry after 5s
  }
};

module.exports = connectDB;