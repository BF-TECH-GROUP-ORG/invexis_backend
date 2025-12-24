// models/StockChange.js — FINAL LOCKED (MULTI-WORKER + POS TRACKING)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const StockChangeSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  shopId: { type: String, required: true, index: true },

  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

  type: {
    type: String,
    enum: ['sale', 'restock', 'return', 'adjustment', 'damage', 'transfer', 'stockin'],
    required: true
  },

  qty: { type: Number, required: true }, // negative = out, positive = in
  previous: { type: Number, required: true },
  new: { type: Number }, // Set by pre-save hook

  reason: { type: String, trim: true },
  orderId: { type: Schema.Types.ObjectId, sparse: true, index: true }, // Order-related stock changes
  userId: { type: String, required: true, index: true },        // WHO did it
  terminalId: { type: String, index: true },                        // POS terminal / device
  sessionId: { type: String },                                     // Cashier session

  meta: { type: Schema.Types.Mixed } // { customerName, receiptNo, note, etc }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

/* -------------------------------------------------------------------------- */
/*                            SUPER-FAST INDEXES                              */
/* -------------------------------------------------------------------------- */

// Core operational indexes
StockChangeSchema.index({ companyId: 1, shopId: 1, createdAt: -1 });
StockChangeSchema.index({ productId: 1, createdAt: -1 });

// User tracking & performance (NEW - for user-specific queries)
StockChangeSchema.index({ userId: 1, companyId: 1, shopId: 1, createdAt: -1 }); // CRITICAL for user-changes
StockChangeSchema.index({ userId: 1, createdAt: -1 });                          // User performance

// Worker performance & shop analysis
StockChangeSchema.index({ shopId: 1, userId: 1, type: 1 });      // Sales per worker
StockChangeSchema.index({ variationId: 1, createdAt: -1 });

// Compound index for shop-level user filtering
StockChangeSchema.index({ companyId: 1, userId: 1, type: 1 });   // User activities by type

/* -------------------------------------------------------------------------- */
/*                          PRE-SAVE: ATOMIC + AUDIT + ALERT                  */
/* -------------------------------------------------------------------------- */
StockChangeSchema.pre('save', async function () {
  // For transfers, skip stock update logic since transfers handle stock updates manually
  // This is because transfers involve two separate products/shops and complex logic
  if (this.type === 'transfer' && this.new !== undefined) {
    // Transfer already calculated 'new' value and will update stock separately
    return;
  }

  // 1. Validate qty sign
  if (this.qty === 0) throw new Error('Quantity cannot be zero');
  const outflow = ['sale', 'adjustment', 'damage'].includes(this.type);
  const inflow = ['restock', 'return'].includes(this.type);
  if (outflow && this.qty > 0) throw new Error('Outflow must be negative');
  if (inflow && this.qty < 0) throw new Error('Inflow must be positive');

  // 2. Validate ownership
  const product = await mongoose.model('Product').findOne({
    _id: this.productId,
    companyId: this.companyId
  }).lean();
  if (!product) throw new Error('Product not owned by company');

  // 3. Get current stock from ProductStock model
  let currentStock = 0;
  const stockRecord = await mongoose.model('ProductStock').findOne({
    productId: this.productId,
    variationId: this.variationId || null
  }).lean();

  if (!stockRecord) throw new Error('Stock record not found');
  currentStock = stockRecord.stockQty || 0;

  // 4. Concurrency protection
  if (currentStock !== this.previous) {
    throw new Error('Stock changed by another worker — retry');
  }

  // 5. Final stock
  this.new = this.previous + this.qty;
  if (this.new < 0) throw new Error('Not enough stock');

  // 6. Apply atomic update to ProductStock
  await mongoose.model('ProductStock').updateOne(
    {
      productId: this.productId,
      variationId: this.variationId || null
    },
    { $set: { stockQty: this.new } }
  );

  // 7. Audit (optional but recommended)
  try {
    await mongoose.model('ProductAudit').create({
      productId: this.productId,
      action: 'stock_change',
      changedBy: this.userId,
      oldValue: { stock: this.previous },
      newValue: { stock: this.new, type: this.type, qty: this.qty },
      meta: { shopId: this.shopId, terminalId: this.terminalId }
    });
  } catch (e) { }

  // 8. Low stock alert
  if (this.new <= 5 && outflow) {
    try {
      await mongoose.model('LowStockAlert').updateOne(
        { productId: this.productId, variationId: this.variationId || null },
        { $set: { currentStock: this.new, notified: false } },
        { upsert: true }
      );
    } catch (e) { }
  }
});

/* -------------------------------------------------------------------------- */
/*                         STATIC: WORKER PERFORMANCE REPORTS                 */
/* -------------------------------------------------------------------------- */
StockChangeSchema.statics.getWorkerSales = async function ({ shopId, userId, startDate, endDate }) {
  const match = { shopId, type: 'sale' };
  if (userId) match.userId = userId;
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userId',
        totalSales: { $sum: { $abs: '$qty' } },
        revenue: { $sum: { $multiply: [{ $abs: '$qty' }, '$meta.unitPrice'] } }, // if you store price in meta
        transactions: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'worker'
      }
    },
    { $unwind: '$worker' },
    {
      $project: {
        workerName: '$worker.name',
        totalItemsSold: '$totalSales',
        totalRevenue: '$revenue',
        transactions: 1
      }
    },
    { $sort: { totalRevenue: -1 } }
  ]);
};

// ========== POST-SAVE: EVENT EMISSION & VELOCITY CALC ==========
StockChangeSchema.post('save', async function (doc) {
  try {
    const Outbox = mongoose.model('Outbox');
    await Outbox.create({
      type: `inventory.stock.${doc.type}`,
      routingKey: `inventory.stock.${doc.type}`,
      payload: {
        productId: doc.productId.toString(),
        variationId: doc.variationId || null,
        type: doc.type,
        qty: doc.qty,
        previous: doc.previous,
        new: doc.new,
        reason: doc.reason,
        userId: doc.userId,
        companyId: doc.companyId,
        shopId: doc.shopId,
        meta: doc.meta,
        timestamp: doc.createdAt
      }
    });
  } catch (err) {
    console.error('Failed to create outbox entry for stock change:', err.message);
  }
});

StockChangeSchema.post('save', async function (doc) {
  try {
    // Only calculate for sales/returns (outflow movements)
    if (!['sale', 'return', 'adjustment', 'damage'].includes(doc.type)) return;

    const ProductStock = mongoose.model('ProductStock');

    // Get stock record
    const stockRecord = await ProductStock.findOne({
      productId: doc.productId,
      variationId: doc.variationId || null
    });

    if (!stockRecord) return;

    // Calculate average daily sales (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const salesLast30Days = await this.collection.aggregate([
      {
        $match: {
          productId: doc.productId,
          variationId: doc.variationId || null,
          type: { $in: ['sale', 'return'] },
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalQty: { $sum: { $abs: '$qty' } },
          daysSpanned: { $max: { $subtract: [new Date(), '$createdAt'] } }
        }
      }
    ]).toArray();

    if (salesLast30Days[0]) {
      const totalQty = Math.abs(salesLast30Days[0].totalQty || 0);
      const avgDaily = totalQty > 0 ? (totalQty / 30).toFixed(2) : 0;

      // Get current stock from ProductStock model
      const currentQty = stockRecord?.stockQty || 0;

      // Calculate stockout risk
      const daysUntilStockout = avgDaily > 0 ? Math.ceil((currentQty - stockRecord.safetyStock) / avgDaily) : 999;
      const suggestedQty = (stockRecord.minReorderQty || 20) * 3; // Suggest 3x min reorder qty

      // Update ProductStock with velocity metrics
      await ProductStock.updateOne(
        { _id: stockRecord._id },
        {
          $set: {
            avgDailySales: parseFloat(avgDaily),
            stockoutRiskDays: Math.max(0, daysUntilStockout),
            suggestedReorderQty: suggestedQty,
            lastForecastUpdate: new Date(),
            totalUnitsSold: (stockRecord.totalUnitsSold || 0) + Math.abs(doc.qty),
            totalRevenue: (stockRecord.totalRevenue || 0) + (Math.abs(doc.qty) * (doc.meta?.unitPrice || 0))
          }
        }
      );
    }
  } catch (err) {
    // Log but don't fail the save
    const logger = require('../utils/logger');
    logger.warn('StockChange post-save velocity calc failed:', err.message);
  }
});

module.exports = mongoose.model('StockChange', StockChangeSchema);
