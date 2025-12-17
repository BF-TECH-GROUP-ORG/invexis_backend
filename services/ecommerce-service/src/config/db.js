require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/app');

// ✅ Optimized MongoDB connection with enhanced pool settings
const connectDB = async () => {
    try {
    const conn = await mongoose.connect(process.env.DB_MONGO || 'mongodb://localhost:27017/ecommercedb', {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            heartbeatFrequencyMS: 10000,
            maxPoolSize: 50,           // ✅ Increased from 10 for better concurrency
            minPoolSize: 10,           // ✅ Maintain minimum connections
            maxIdleTimeMS: 30000,      // ✅ Close idle connections after 30s
            waitQueueTimeoutMS: 10000, // ✅ Timeout for waiting in queue
        });
        console.log(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;