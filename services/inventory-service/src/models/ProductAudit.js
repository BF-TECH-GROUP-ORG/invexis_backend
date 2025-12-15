const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductAuditSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  action: { type: String, required: true, index: true },
  changedBy: { type: String, default: null },
  timestamp: { type: Date, default: Date.now, index: true },
  oldValue: Schema.Types.Mixed,
  newValue: Schema.Types.Mixed,
  meta: Schema.Types.Mixed
}, {
  timestamps: false,
});

ProductAuditSchema.index({ productId: 1, action: 1, timestamp: -1 });

module.exports = mongoose.model('ProductAudit', ProductAuditSchema);
