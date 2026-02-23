// models/Alert.js (Unchanged from improved version)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const alertSchema = new Schema({
  // Scope: company-level, shop-level, or global
  companyId: { type: String, required: true, index: true }, // Required for all alerts
  shopId: { type: String, default: null, index: true }, // Optional: if present, alert is shop-specific; if null, company-level or global
  scope: {
    type: String,
    enum: ['global', 'company', 'shop'],
    default: 'company',
    index: true
  }, // Determines visibility: global=all, company=within company, shop=specific shop

  // Alert type and message
  type: {
    type: String,
    enum: [
      // Event-based alerts
      'low_stock',
      'out_of_stock',
      'price_change',
      'new_product',
      'new_arrival', // Global new product alert
      'expired_discount',
      'high_returns',
      'order_created',
      'order_shipped',
      'order_delivered',
      'inventory_adjustment',
      'stock_received',
      'product_expiring',
      'product_expired',
      // Smart/Scheduled Alerts
      'daily_summary',
      'weekly_summary',
      'monthly_summary',
      'high_velocity',
      'dead_stock',
      'stock_out_prediction',
      'rebalancing_suggestion',
      // Guardian AI (Fraud Prevention)
      'suspicious_cancellation',
      'price_overwrite',
      'night_watch_activity'
    ],
    required: true
  },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
  orderId: { type: String, default: null }, // For order-related alerts
  threshold: { type: Number, min: 0 },
  message: { type: String, required: true, trim: true },
  description: { type: String, trim: true }, // Optional longer description
  data: { type: Object, default: {} }, // Flexible field for structured data
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

  // Resolved status
  isResolved: { type: Boolean, default: false, index: true },
  resolvedBy: { type: String, default: null },
  resolvedAt: { type: Date, default: null },

  // Read/Unread tracking (autonomous)
  isRead: { type: Boolean, default: false, index: true },
  readBy: [
    {
      userId: { type: String, required: true },
      role: { type: String, default: 'user' }, // user, admin, manager
      readAt: { type: Date, default: Date.now }
    }
  ],
  readCount: { type: Number, default: 0 }, // Total number of users who've read this

  // Metadata
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null } // Auto-delete old alerts if set
});

// Improved indexes for better query performance
alertSchema.index({ companyId: 1, type: 1, createdAt: -1 });
alertSchema.index({ companyId: 1, isResolved: 1, priority: -1 });
alertSchema.index({ companyId: 1, shopId: 1, scope: 1, isRead: 1 });
alertSchema.index({ companyId: 1, isRead: 1, priority: -1, createdAt: -1 });
alertSchema.index({ scope: 1, isRead: 1, createdAt: -1 }); // For global alerts
alertSchema.index({ 'readBy.userId': 1 }); // Find which alerts a user has read

// Pre-save middleware with improved validation
alertSchema.pre('save', function (next) {
  this.updatedAt = new Date();

  // Require threshold only for stock-related types
  if (['low_stock', 'out_of_stock'].includes(this.type) && this.threshold == null) {
    return next(new Error('Threshold is required for stock-related alerts'));
  }

  // Validate scope
  if (this.scope === 'shop' && !this.shopId) {
    return next(new Error('shopId is required when scope is "shop"'));
  }

  if (this.scope === 'global') {
    this.companyId = 'global'; // Standardize global alerts
  }

  // Auto-set resolution details if marking as resolved
  if (this.isModified('isResolved') && this.isResolved && !this.resolvedAt) {
    this.resolvedAt = new Date();
    this.resolvedBy = this.resolvedBy || 'system';
  }

  // Auto-set read status if all relevant users have read it
  if (this.readCount > 0 && !this.isRead && this.scope === 'company') {
    // Note: In real scenario, you may need more complex logic
  }

  // Ensure at least one link for non-global alerts
  const globalTypes = ['new_arrival', 'new_product'];
  if (!globalTypes.includes(this.type) && !this.productId && !this.categoryId && !this.orderId) {
    if (this.scope !== 'global') {
      return next(new Error('Alert must be linked to a product, category, or order for this type'));
    }
  }

  next();
});

// Event emission hook
alertSchema.post('save', async function (doc) {
  try {
    const Outbox = mongoose.model('Outbox');
    await Outbox.create({
      type: 'inventory.alert.triggered',
      routingKey: `inventory.alert.${doc.type}`,
      payload: doc.toObject()
    });
  } catch (err) {
    console.error('Failed to create outbox entry for alert:', err.message);
  }
});

// ========== DEDUPLICATION: CreateOrUpdate to prevent alert spam ==========
alertSchema.statics.createOrUpdate = async function (alertData) {
  try {
    const { companyId, type, productId, shopId } = alertData;

    // For stock alerts: check if unresolved alert exists within 4 hours
    if (['low_stock', 'out_of_stock'].includes(type)) {
      const existingAlert = await this.findOne({
        companyId,
        type,
        productId: productId || null,
        shopId: shopId || null,
        isResolved: false,
        createdAt: { $gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } // Last 4 hours
      });

      if (existingAlert) {
        // Increment count and update data instead of creating new alert
        existingAlert.data = existingAlert.data || {};
        existingAlert.data.triggerCount = (existingAlert.data.triggerCount || 1) + 1;
        existingAlert.data.lastTriggered = new Date();
        existingAlert.message = alertData.message; // Update message with latest info
        return await existingAlert.save();
      }
    }

    // No duplicate found, create new alert
    return await this.create(alertData);
  } catch (err) {
    throw new Error(`Alert.createOrUpdate failed: ${err.message}`);
  }
};

// Static method to get unresolved alerts, improved with limit and populate
alertSchema.statics.getUnresolvedAlerts = async function (companyId, limit = 50) {
  return await this.find({ companyId, isResolved: false })
    .populate('productId', 'name slug')
    .populate('categoryId', 'name slug')
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit);
};

// Static method to get unread alerts for a specific scope and user
alertSchema.statics.getUnreadAlerts = async function (companyId, userId, shopId = null, limit = 50) {
  const query = { companyId, isRead: false };

  // Determine scope based on shopId
  if (shopId) {
    query.$or = [
      { scope: 'shop', shopId },
      { scope: 'company' },
      { scope: 'global' }
    ];
  } else {
    query.$or = [
      { scope: 'company' },
      { scope: 'global' }
    ];
  }

  return await this.find(query)
    .populate('productId', 'name slug')
    .populate('categoryId', 'name slug')
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit);
};

// Static method to get alert history with filters
alertSchema.statics.getHistory = async function (companyId, filters = {}) {
  const {
    shopId = null,
    type = null,
    scope = null,
    startDate = null,
    endDate = null,
    isRead = null,
    priority = null,
    page = 1,
    limit = 20
  } = filters;

  const query = { companyId };

  if (shopId) {
    query.$or = [
      { scope: 'shop', shopId },
      { scope: 'company' },
      { scope: 'global' }
    ];
  }
  if (type) query.type = type;
  if (scope) query.scope = scope;
  if (isRead !== null && isRead !== undefined) query.isRead = isRead === 'true' || isRead === true;
  if (priority) query.priority = priority;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [alerts, total] = await Promise.all([
    this.find(query)
      .populate('productId', 'name slug')
      .populate('categoryId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    this.countDocuments(query)
  ]);

  return {
    alerts,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

// Instance method to resolve alert
alertSchema.methods.resolve = async function (resolvedBy) {
  this.isResolved = true;
  this.resolvedBy = resolvedBy || 'system';
  this.resolvedAt = new Date();
  this.updatedAt = new Date();
  await this.save();
};

// Instance method to mark alert as read by a user
alertSchema.methods.markAsRead = async function (userId, userRole = 'user') {
  // Check if user already read this
  const alreadyRead = this.readBy.some(r => r.userId === userId);

  if (!alreadyRead) {
    this.readBy.push({
      userId,
      role: userRole,
      readAt: new Date()
    });
    this.readCount = this.readBy.length;
  }

  this.isRead = true;
  this.updatedAt = new Date();
  await this.save();
};

// Instance method to mark alert as unread
alertSchema.methods.markAsUnread = async function () {
  this.isRead = false;
  this.updatedAt = new Date();
  await this.save();
};

// Instance method to check if a user has read this alert
alertSchema.methods.isReadByUser = function (userId) {
  return this.readBy.some(r => r.userId === userId);
};

module.exports = mongoose.model('Alert', alertSchema);