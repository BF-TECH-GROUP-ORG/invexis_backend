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
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV !== 'test' ? [new winston.transports.File({
      filename: path.join(logDir, 'sales-service.log'),
      maxsize: 100 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })] : [])
  ]
});

module.exports = logger;