const mongoose = require('mongoose');

const InventorySnapshotSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String },
    category: { type: String, index: true },

    date: { type: String, required: true, index: true }, // YYYY-MM-DD

    openingStock: { type: Number, default: 0 },
    stockIn: { type: Number, default: 0 },
    stockOut: { type: Number, default: 0 },
    closingStock: { type: Number, default: 0 },

    unitCost: { type: Number, default: 0 },
    totalStockValue: { type: Number, default: 0 },

    reorderLevel: { type: Number, default: 0 },
    lastRestockDate: { type: Date },
    lastMovementDate: { type: Date }
}, { timestamps: true });

InventorySnapshotSchema.index({ companyId: 1, date: 1 });
InventorySnapshotSchema.index({ shopId: 1, date: 1 });

module.exports = mongoose.model('InventorySnapshot', InventorySnapshotSchema);
