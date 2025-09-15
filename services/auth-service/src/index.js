const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/app');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => logger.info(`Server running on port http://localhost:${PORT}`));
    } catch (error) {
        logger.error('Server startup error:', error);
        process.exit(1);
    }
};

startServer();