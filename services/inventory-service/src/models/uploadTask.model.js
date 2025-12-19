const mongoose = require('mongoose');

const UploadTaskSchema = new mongoose.Schema({
  companyId: { type: String, required: false },
  shopId: { type: String, required: false },
  productId: { type: mongoose.Types.ObjectId, required: false },
  field: { type: String, enum: ['images', 'videos', 'qr', 'barcode'], required: true },
  placeholderId: { type: String, required: true },
  placeholderUrl: { type: String },
  originalName: { type: String },
  folder: { type: String },
  publicIdHint: { type: String },
  // Either a path to temp file or base64 buffer
  filePath: { type: String },
  fileBase64: { type: String },
  status: { type: String, enum: ['pending', 'in-progress', 'failed', 'done'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 8 }, // Covers ~24 hours with 3-hour intervals
  lastError: { type: String },
  nextRetryAt: { type: Date }, // When to next attempt the upload
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Index for efficient worker queries: find pending tasks ready to retry
UploadTaskSchema.index({ status: 1, nextRetryAt: 1 });
// Index for cleanup: find old failed tasks
UploadTaskSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('UploadTask', UploadTaskSchema);
