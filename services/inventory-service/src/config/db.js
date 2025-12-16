<<<<<<< HEAD
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

=======
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_MONGO || 'mongodb://localhost:27017/inventorydb', {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    console.info('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    setTimeout(connectDB, 5000); // Retry after 5s
  }
};

>>>>>>> 55eb3af5e260dabebd54e7923b37bc5096e6e6ae
module.exports = connectDB;