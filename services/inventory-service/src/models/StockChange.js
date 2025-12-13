// models/StockChange.js — FINAL LOCKED (MULTI-WORKER + POS TRACKING)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const StockChangeSchema = new Schema({
  companyId:   { type: String, required: true, index: true },
  shopId:      { type: String, required: true, index: true },

  productId:   { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
 
  type: {
    type: String,
    enum: ['sale', 'restock', 'return', 'adjustment', 'damage', 'transfer' , 'stockin'],
    required: true
  },

  qty:         { type: Number, required: true }, // negative = out, positive = in
  previous:    { type: Number, required: true },
  new:         { type: Number, required: true },

  reason:      { type: String, trim: true },
  orderId:     { type: Schema.Types.ObjectId, index: true, sparse: true },
  userId:      { type: String, required: true, index: true },        // WHO did it
  terminalId:  { type: String, index: true },                        // POS terminal / device
  sessionId:   { type: String },                                     // Cashier session

  meta: { type: Schema.Types.Mixed } // { customerName, receiptNo, note, etc }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

/* -------------------------------------------------------------------------- */
/*                            SUPER-FAST INDEXES                              */
/* -------------------------------------------------------------------------- */
StockChangeSchema.index({ companyId: 1, shopId: 1, createdAt: -1 });
StockChangeSchema.index({ userId: 1, createdAt: -1 });           // Worker performance
StockChangeSchema.index({ shopId: 1, userId: 1, type: 1 });      // Sales per worker
StockChangeSchema.index({ productId: 1, createdAt: -1 });
StockChangeSchema.index({ variationId: 1, createdAt: -1 });
StockChangeSchema.index({ orderId: 1 });

/* -------------------------------------------------------------------------- */
/*                          PRE-SAVE: ATOMIC + AUDIT + ALERT                  */
/* -------------------------------------------------------------------------- */
StockChangeSchema.pre('save', async function(next) {
  try {
    // 1. Validate qty sign
    if (this.qty === 0) return next(new Error('Quantity cannot be zero'));
    const outflow = ['sale', 'adjustment', 'damage'].includes(this.type);
    const inflow  = ['restock', 'return', 'transfer'].includes(this.type);
    if (outflow && this.qty > 0) return next(new Error('Outflow must be negative'));
    if (inflow  && this.qty < 0) return next(new Error('Inflow must be positive'));

    // 2. Validate ownership
    const product = await mongoose.model('Product').findOne({
      _id: this.productId,
      companyId: this.companyId
    }).lean();
    if (!product) return next(new Error('Product not owned by company'));

    // 3. Get current stock
    let currentStock = 0;
    if (this.variationId) {
      const v = await mongoose.model('ProductVariation').findById(this.variationId).select('stockQty').lean();
      if (!v) return next(new Error('Variation not found'));
      currentStock = v.stockQty || 0;
    } else {
      const total = await mongoose.model('ProductVariation').aggregate([
        { $match: { productId: this.productId } },
        { $group: { _id: null, total: { $sum: '$stockQty' } } }
      ]);
      currentStock = total[0]?.total || 0;
    }

    // 4. Concurrency protection
    if (currentStock !== this.previous) {
      return next(new Error('Stock changed by another worker — retry'));
    }

    // 5. Final stock
    this.new = this.previous + this.qty;
    if (this.new < 0) return next(new Error('Not enough stock'));

    // 6. Apply atomic update
    if (this.variationId) {
      await mongoose.model('ProductVariation').updateOne(
        { _id: this.variationId },
        { $set: { stockQty: this.new } }
      );
    }

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
    } catch (e) {}

    // 8. Low stock alert
    if (this.new <= 5 && outflow) {
      try {
        await mongoose.model('LowStockAlert').updateOne(
          { productId: this.productId, variationId: this.variationId || null },
          { $set: { currentStock: this.new, notified: false } },
          { upsert: true }
        );
      } catch (e) {}
    }

    next();
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/*                         STATIC: WORKER PERFORMANCE REPORTS                 */
/* -------------------------------------------------------------------------- */
StockChangeSchema.statics.getWorkerSales = async function({ shopId, userId, startDate, endDate }) {
  const match = { shopId, type: 'sale' };
  if (userId) match.userId = userId;
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate)   match.createdAt.$lte = new Date(endDate);
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

// ========== POST-SAVE: AUTO-CALCULATE VELOCITY & FORECAST ==========
StockChangeSchema.post('save', async function(doc) {
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
      
      // Get current stock
      const ProductVariation = mongoose.model('ProductVariation');
      let currentQty = 0;
      if (doc.variationId) {
        const v = await ProductVariation.findById(doc.variationId).select('stockQty').lean();
        currentQty = v?.stockQty || 0;
      } else {
        const agg = await ProductVariation.aggregate([
          { $match: { productId: doc.productId } },
          { $group: { _id: null, total: { $sum: '$stockQty' } } }
        ]);
        currentQty = agg[0]?.total || 0;
      }

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
