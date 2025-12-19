const uploadRepo = require('../repositories/uploadTaskRepository');
const { uploadBuffer } = require('../utils/uploadUtil');
const fs = require('fs');
const Product = require('../models/Product');
const logger = require('../utils/logger');

let running = false;

async function processTask(task) {
  await uploadRepo.markInProgress(task._id);
  let buffer = null;
  try {
    if (task.filePath) {
      buffer = await fs.promises.readFile(task.filePath);
    } else if (task.fileBase64) {
      buffer = Buffer.from(task.fileBase64, 'base64');
    } else {
      throw new Error('No file data available for retry');
    }

    const folder = task.folder || 'products';
    // Let Cloudinary assign the public_id automatically
    const res = await uploadBuffer(buffer, folder);

    // Patch product: try to find product by placeholderId or placeholderUrl if productId not provided
    let product = null;
    if (task.productId) product = await Product.findById(task.productId);
    if (!product) {
      // Try to find by image placeholderId or by video placeholderUrl
      const query = {
        $or: [
          { 'images.cloudinary_id': task.placeholderId },
          { videoUrls: task.placeholderUrl }
        ]
      };
      product = await Product.findOne(query);
    }

    if (product) {
      if (task.field === 'videos') {
        // try to replace matching placeholder URL if present
        const idx = (product.videoUrls || []).findIndex(u => u === task.placeholderUrl);
        if (idx !== -1) product.videoUrls[idx] = res.secure_url || product.videoUrls[idx];
        else product.videoUrls.push(res.secure_url);
      } else if (task.field === 'qr') {
        product.qrCodeUrl = res.secure_url || product.qrCodeUrl;
        product.qrCloudinaryId = res.public_id || product.qrCloudinaryId;
      } else if (task.field === 'barcode') {
        product.barcodeUrl = res.secure_url || product.barcodeUrl;
        product.barcodeCloudinaryId = res.public_id || product.barcodeCloudinaryId;
      } else {
        const images = product.images || [];
        const idx = images.findIndex(it => String(it.cloudinary_id) === String(task.placeholderId));
        if (idx !== -1) {
          images[idx].url = res.secure_url || images[idx].url;
          images[idx].cloudinary_id = res.public_id || images[idx].cloudinary_id;
        } else {
          images.push({ url: res.secure_url, cloudinary_id: res.public_id, type: 'image' });
        }
        product.images = images;
      }
      try { await product.save(); } catch (e) { logger.warn('UploadRetry: failed to save product patch', e && e.message ? e.message : e); }
    }
    // After successful upload and product patch, try to remove the stored file
    if (task.filePath) {
      try { await fs.promises.unlink(task.filePath); } catch (e) { /* ignore */ }
    }

    await uploadRepo.markDone(task._id);
    logger.info(`UploadRetry: succeeded for task ${task._id}`);
  } catch (err) {
    logger.warn(`UploadRetry: failed for task ${task._id} (attempt ${task.attempts}): ${err && err.message ? err.message : err}`);
    // Pass attempt count so repository can calculate next retry time
    await uploadRepo.markFailed(task._id, err && err.message ? err.message : String(err), task.attempts);
  }
}

async function loop(intervalMs = 5000) {
  if (running) return;
  running = true;
  logger.info('UploadRetryWorker started');
  setInterval(async () => {
    try {
      const tasks = await uploadRepo.getPendingBatch(20);
      if (tasks.length > 0) {
        logger.debug(`UploadRetryWorker: processing ${tasks.length} pending tasks`);
      }
      for (const t of tasks) {
        try { await processTask(t); } catch (e) { logger.warn('UploadRetryWorker task processing error', e); }
      }
    } catch (e) { logger.error('UploadRetryWorker loop error', e); }
  }, intervalMs);
}

module.exports = { loop };
