const UploadTask = require('../models/uploadTask.model');

// Calculate next retry time using exponential backoff: 3 hours * attempt count
// attemptCount: 1 -> 3h, 2 -> 6h, 3 -> 9h, etc.
function calculateNextRetry(attemptCount) {
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
  return new Date(Date.now() + THREE_HOURS_MS * attemptCount);
}

async function createTask(task) {
  // Set initial nextRetryAt to "now" so worker can pick it up immediately
  if (!task.nextRetryAt) {
    task.nextRetryAt = new Date();
  }
  if (!task.maxAttempts) {
    task.maxAttempts = 8; // Allow up to 8 attempts over ~24 hours
  }
  const doc = new UploadTask(task);
  return doc.save();
}

async function getPendingBatch(limit = 25) {
  // Only fetch tasks that are scheduled to retry now (nextRetryAt <= now)
  const now = new Date();
  return UploadTask.find({
    status: 'pending',
    nextRetryAt: { $lte: now }
  }).sort({ createdAt: 1 }).limit(limit).lean();
}

async function markInProgress(id) {
  return UploadTask.findByIdAndUpdate(id, { $set: { status: 'in-progress' }, $inc: { attempts: 1 }, updatedAt: new Date() }, { new: true });
}

async function markDone(id) {
  return UploadTask.findByIdAndUpdate(id, { status: 'done', updatedAt: new Date() });
}

async function markFailed(id, errMsg, attemptCount = 0) {
  // Calculate next retry time if we haven't exceeded max attempts
  const task = await UploadTask.findById(id);
  if (!task) return null;
  
  const nextAttempt = attemptCount + 1;
  const maxAttempts = task.maxAttempts || 8;
  
  if (nextAttempt < maxAttempts) {
    // Schedule next retry using exponential backoff
    const nextRetryAt = calculateNextRetry(nextAttempt);
    return UploadTask.findByIdAndUpdate(id, {
      $set: {
        status: 'pending', // Keep as pending, not failed yet
        nextRetryAt,
        lastError: String(errMsg).substring(0, 1000),
        updatedAt: new Date()
      }
    });
  } else {
    // Exceeded max attempts, mark as failed
    return UploadTask.findByIdAndUpdate(id, {
      $set: {
        status: 'failed',
        lastError: String(errMsg).substring(0, 1000),
        updatedAt: new Date()
      }
    });
  }
}

// Delete old failed tasks (older than 24 hours)
async function cleanupOldFailedTasks() {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const cutoffTime = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
  
  const result = await UploadTask.deleteMany({
    status: 'failed',
    createdAt: { $lt: cutoffTime }
  });
  
  return result;
}

module.exports = {
  createTask,
  getPendingBatch,
  markInProgress,
  markDone,
  markFailed,
  calculateNextRetry,
  cleanupOldFailedTasks
};
