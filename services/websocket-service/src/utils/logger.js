// websocket-service/src/utils/logger.js (unchanged)
const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (err) {
    console.error('Failed to create log directory:', err.message);
}

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'websocket-service.log'),
            maxsize: 100 * 1024 * 1024,
            maxFiles: 5,
            tailable: true
        })
    ]
});

module.exports = logger;