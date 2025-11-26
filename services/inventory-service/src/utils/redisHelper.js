const redis = require('/app/shared/redis');
const { logger } = require('./logger');

/**
 * Delete keys matching pattern
 * @param {string} pattern 
 */
const scanDel = async (pattern) => {
    try {
        const stream = redis.scanStream({
            match: pattern,
            count: 100
        });

        stream.on('data', (keys) => {
            if (keys.length) {
                const pipeline = redis.pipeline();
                keys.forEach((key) => {
                    pipeline.del(key);
                });
                pipeline.exec();
            }
        });

        stream.on('end', () => {
            logger.info(`Redis scanDel completed for pattern: ${pattern}`);
        });
    } catch (error) {
        logger.error(`Redis scanDel error for pattern ${pattern}:`, error);
    }
};

module.exports = { scanDel };
