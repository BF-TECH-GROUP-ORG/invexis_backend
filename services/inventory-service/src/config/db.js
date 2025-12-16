const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://root:invexispass@mongodb:27017/inventorydb?authSource=admin', {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    console.info('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    setTimeout(connectDB, 5000); // Retry after 5s
  }
};

module.exports = connectDB;