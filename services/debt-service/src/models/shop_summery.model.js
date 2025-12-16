<<<<<<< HEAD
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


=======
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
            customerId: { type: mongoose.Types.ObjectId },
            outstanding: { type: Number }
        }
    ],


    updatedAt: { type: Date, default: Date.now }
});


ShopSummarySchema.index({ companyId: 1, shopId: 1 }, { unique: true });


>>>>>>> 55eb3af5e260dabebd54e7923b37bc5096e6e6ae
module.exports = mongoose.model('ShopDebtSummary', ShopSummarySchema);