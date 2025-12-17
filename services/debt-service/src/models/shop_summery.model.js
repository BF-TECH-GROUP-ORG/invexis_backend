const mongoose = require('mongoose');
// models/shopSummary.model.js
const ShopSummarySchema = new mongoose.Schema({
    companyId: { type: mongoose.Types.ObjectId, index: true, required: true },
    shopId: { type: mongoose.Types.ObjectId, index: true, required: true },


    totalOutstanding: { type: Number, default: 0 },
    totalRepaidThisMonth: { type: Number, default: 0 },
    totalDebtCreatedThisMonth: { type: Number, default: 0 },


    numberOfActiveDebts: { type: Number, default: 0 },


    topCustomers: [
        {
            // Track by hashedCustomerId instead of raw customerId
            hashedCustomerId: { type: String },
            outstanding: { type: Number }
        }
    ],


    updatedAt: { type: Date, default: Date.now }
});


ShopSummarySchema.index({ companyId: 1, shopId: 1 }, { unique: true });


module.exports = mongoose.model('ShopDebtSummary', ShopSummarySchema);