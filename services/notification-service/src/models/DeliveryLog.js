// src/models/DeliveryLog.js
const mongoose = require("mongoose");

const deliveryLogSchema = new mongoose.Schema(
  {
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ["email", "sms", "push", "inApp"],
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    companyId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "failed", "bounced", "read"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    provider: {
      type: String, // 'gmail', 'twilio', 'firebase', 'websocket'
      index: true,
    },
    providerId: {
      type: String, // External provider's message ID
      index: true,
    },
    recipient: {
      type: String, // Email address, phone number, FCM token, or userId
      required: true,
    },
    error: {
      message: String,
      code: String,
      stack: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    failedAt: Date,
    nextRetryAt: Date,
    responseTime: Number, // Time taken to send in milliseconds
  },
  { timestamps: true }
);

// Compound indexes for common queries
deliveryLogSchema.index({ notificationId: 1, channel: 1 });
deliveryLogSchema.index({ userId: 1, status: 1, createdAt: -1 });
deliveryLogSchema.index({ companyId: 1, channel: 1, status: 1 });
deliveryLogSchema.index({ status: 1, nextRetryAt: 1 }); // For retry processing
deliveryLogSchema.index({ providerId: 1 }); // For webhook lookups
deliveryLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

// Static methods
deliveryLogSchema.statics.createLog = async function (data) {
  return await this.create({
    ...data,
    attempts: 0,
    status: "pending",
  });
};

deliveryLogSchema.statics.markAsSent = async function (
  logId,
  providerId,
  responseTime
) {
  return await this.findByIdAndUpdate(
    logId,
    {
      status: "sent",
      sentAt: new Date(),
      providerId,
      responseTime,
      $inc: { attempts: 1 },
    },
    { new: true }
  );
};

deliveryLogSchema.statics.markAsDelivered = async function (logId) {
  return await this.findByIdAndUpdate(
    logId,
    {
      status: "delivered",
      deliveredAt: new Date(),
    },
    { new: true }
  );
};

deliveryLogSchema.statics.markAsRead = async function (logId) {
  return await this.findByIdAndUpdate(
    logId,
    {
      status: "read",
      readAt: new Date(),
    },
    { new: true }
  );
};

deliveryLogSchema.statics.markAsFailed = async function (
  logId,
  error,
  nextRetryAt = null
) {
  return await this.findByIdAndUpdate(
    logId,
    {
      status: "failed",
      failedAt: new Date(),
      error: {
        message: error.message,
        code: error.code || "UNKNOWN",
        stack: error.stack,
      },
      nextRetryAt,
      $inc: { attempts: 1 },
    },
    { new: true }
  );
};

deliveryLogSchema.statics.getDeliveryStats = async function (
  companyId,
  startDate,
  endDate
) {
  return await this.aggregate([
    {
      $match: {
        companyId: mongoose.Types.ObjectId(companyId),
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          channel: "$channel",
          status: "$status",
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: "$responseTime" },
      },
    },
  ]);
};

deliveryLogSchema.statics.getPendingRetries = async function (limit = 100) {
  return await this.find({
    status: "failed",
    nextRetryAt: { $lte: new Date() },
    attempts: { $lt: this.maxAttempts },
  }).limit(limit);
};

// Instance methods
deliveryLogSchema.methods.canRetry = function () {
  return this.attempts < this.maxAttempts && this.status === "failed";
};

deliveryLogSchema.methods.calculateNextRetry = function () {
  // Exponential backoff: 1min, 5min, 15min
  const delays = [60000, 300000, 900000];
  const delay = delays[Math.min(this.attempts, delays.length - 1)];
  return new Date(Date.now() + delay);
};

module.exports = mongoose.model("DeliveryLog", deliveryLogSchema);
