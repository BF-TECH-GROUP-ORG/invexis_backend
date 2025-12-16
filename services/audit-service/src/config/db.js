const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://root:invexispass@mongodb:27017/auditdb?authSource=admin', {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', {
                name: err.name,
                message: err.message,
                code: err.code,
                stack: err.stack
            });
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected successfully');
        });

        console.log('MongoDB connected successfully');
    } catch (error) {
        const errorDetails = {
            name: error.name,
            message: error.message,
            code: error.code,
            errorLabels: error.errorLabels,
            stack: error.stack
        };

        switch (error.name) {
            case 'MongoServerSelectionError':
                console.error('Failed to connect to MongoDB server:', {
                    ...errorDetails,
                    reason: 'Server selection timed out',
                    hosts: error.topology?.description?.servers?.map(s => ({
                        address: s.address,
                        type: s.type,
                        state: s.state
                    }))
                });
                break;
            case 'MongoParseError':
                console.error('Invalid MongoDB connection string:', errorDetails);
                break;
            case 'MongoNetworkError':
                console.error('MongoDB network error:', {
                    ...errorDetails,
                    isRetryable: error.isRetryable
                });
                break;
            default:
                console.error('MongoDB connection error:', errorDetails);
        }

        throw new Error(`Database connection failed: ${error.message}`);
    }
};

module.exports = connectDB;
