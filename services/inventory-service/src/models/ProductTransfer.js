const mongoose = require('mongoose');

/**
 * ProductTransfer Model
 * Tracks all product transfers between shops (intra-company and cross-company)
 * Maintains complete audit trail and transfer metadata
 */
const ProductTransferSchema = new mongoose.Schema({
    // Transfer Identification
    transferId: {
        type: String,
        required: true,
        unique: true,
        default: () => `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
    },
    transferType: {
        type: String,
        enum: ['intra_company', 'cross_company'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'in_transit', 'completed', 'cancelled', 'failed'],
        default: 'completed', // Direct execution - no waiting
        index: true
    },

    // Source Information
    sourceCompanyId: {
        type: String,
        required: true,
        index: true
    },
    sourceShopId: {
        type: String,
        required: true,
        index: true
    },
    sourceShopName: String,

    // Destination Information
    destinationCompanyId: {
        type: String,
        required: true,
        index: true
    },
    destinationShopId: {
        type: String,
        required: true,
        index: true
    },
    destinationShopName: String,

    // Product Information
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    productName: String,
    productSku: String,
    
    // Transfer Details
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    reason: {
        type: String,
        required: true
    },
    
    // Stock Status
    sourceStockBefore: Number,
    sourceStockAfter: Number,
    destinationStockBefore: Number,
    destinationStockAfter: Number,

    // Product Data Transferred (for cross-company transfers)
    transferredProductData: {
        pricing: {
            cost: Number,
            price: Number,
            compareAtPrice: Number,
            currency: String
        },
        attributes: mongoose.Schema.Types.Mixed,
        images: [String],
        category: String,
        tags: [String],
        trackQuantity: Boolean,
        lowStockThreshold: Number,
        allowBackorder: Boolean
    },

    // User & Authorization (Direct execution - no approval needed)
    performedBy: {
        userId: {
            type: String,
            required: true,
            index: true
        }
    },

    // Stock Change References (for complete audit trail)
    sourceStockChangeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StockChange'
    },
    destinationStockChangeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StockChange'
    },

    // New Product ID created in destination (for cross-company)
    createdProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    },

    // Timing
    initiatedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    completedAt: {
        type: Date,
        default: Date.now // Direct execution
    },

    // Financial Impact
    estimatedValue: Number,
    actualValue: Number,
    currency: {
        type: String,
        default: 'USD'
    },

    // Notes & Communication
    notes: String,
    internalNotes: String,
    
    // Metadata
    metadata: {
        isAutomatic: Boolean, // Auto-triggered by low stock detection
        parentTransferId: String, // If part of a larger redistribution
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium'
        },
        tags: [String]
    },

    // Audit Trail
    statusHistory: [{
        status: String,
        timestamp: Date,
        updatedBy: String,
        note: String
    }]
}, {
    timestamps: true,
    collection: 'product_transfers'
});

// Indexes for efficient queries
ProductTransferSchema.index({ sourceCompanyId: 1, status: 1, initiatedAt: -1 });
ProductTransferSchema.index({ destinationCompanyId: 1, status: 1, initiatedAt: -1 });
ProductTransferSchema.index({ productId: 1, initiatedAt: -1 });
ProductTransferSchema.index({ transferType: 1, status: 1 });
ProductTransferSchema.index({ 'initiatedBy.userId': 1, initiatedAt: -1 });

// Virtual for transfer direction
ProductTransferSchema.virtual('isCrossCompany').get(function() {
    return this.sourceCompanyId !== this.destinationCompanyId;
});

// Method to update status with history
ProductTransferSchema.methods.updateStatus = function(newStatus, userId, note) {
    this.statusHistory.push({
        status: this.status,
        timestamp: new Date(),
        updatedBy: userId,
        note: note || `Status changed to ${newStatus}`
    });
    this.status = newStatus;
    
    if (newStatus === 'completed') {
        this.completedAt = new Date();
    }
    
    return this.save();
};

// Method to complete transfer
ProductTransferSchema.methods.complete = function(stockData) {
    this.status = 'completed';
    this.completedAt = new Date();
    this.sourceStockAfter = stockData.sourceStockAfter;
    this.destinationStockAfter = stockData.destinationStockAfter;
    
    this.statusHistory.push({
        status: 'completed',
        timestamp: new Date(),
        updatedBy: 'system',
        note: 'Transfer completed successfully'
    });
    
    return this.save();
};

// Static method to get transfer statistics
ProductTransferSchema.statics.getTransferStats = async function(companyId, dateRange) {
    const matchStage = {
        $or: [
            { sourceCompanyId: companyId },
            { destinationCompanyId: companyId }
        ]
    };
    
    if (dateRange) {
        matchStage.initiatedAt = {
            $gte: dateRange.start,
            $lte: dateRange.end
        };
    }
    
    return this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    type: '$transferType',
                    status: '$status'
                },
                count: { $sum: 1 },
                totalQuantity: { $sum: '$quantity' },
                totalValue: { $sum: '$actualValue' }
            }
        }
    ]);
};

// Static method to find pending transfers for a product
ProductTransferSchema.statics.findPendingByProduct = function(productId) {
    return this.find({
        productId,
        status: { $in: ['pending', 'in_transit'] }
    }).sort({ initiatedAt: -1 });
};

module.exports = mongoose.model('ProductTransfer', ProductTransferSchema);
