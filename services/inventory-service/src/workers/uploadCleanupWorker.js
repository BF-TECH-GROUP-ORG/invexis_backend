const uploadRepo = require('../repositories/uploadTaskRepository');
const logger = require('../utils/logger');

let running = false;

/**
 * Cleanup old failed upload tasks (older than 24 hours)
 * Runs periodically to prevent database bloat
 */
async function runCleanup() {
  try {
    const result = await uploadRepo.cleanupOldFailedTasks();
    if (result.deletedCount > 0) {
      logger.info(`UploadCleanupWorker: cleaned up ${result.deletedCount} old failed tasks`);
    }
  } catch (err) {
    logger.error('UploadCleanupWorker: cleanup failed', err);
  }
}

/**
 * Start the cleanup worker
 * @param {number} intervalMs - Interval between cleanup runs (default: 1 hour)
 */
async function loop(intervalMs = 60 * 60 * 1000) {
  if (running) return;
  running = true;
  logger.info('UploadCleanupWorker started');
  
  // Run cleanup immediately on startup
  await runCleanup();
  
  // Run cleanup periodically
  setInterval(async () => {
    try {
      await runCleanup();
    } catch (e) {
      logger.error('UploadCleanupWorker loop error', e);
    }
  }, intervalMs);
}

module.exports = { loop, runCleanup };
