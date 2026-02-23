const mongoose = require('mongoose');

const operatingHourSchema = new mongoose.Schema({
    day_of_week: {
        type: Number, // 0-6 (Sunday-Saturday)
        required: true
    },
    open_time: {
        type: String, // HH:mm format (24h)
        required: true
    },
    close_time: {
        type: String, // HH:mm format (24h)
        required: true
    }
}, { _id: false });

const shopScheduleSchema = new mongoose.Schema({
    shopId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    companyId: {
        type: String,
        required: true,
        index: true
    },
    shopName: {
        type: String,
        required: true
    },
    timezone: {
        type: String,
        default: 'Africa/Kigali'
    },
    operatingHours: [operatingHourSchema],
    isActive: {
        type: Boolean,
        default: true
    },
    lastSyncedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'shopschedules'
});

// Index for efficient querying by scheduler
shopScheduleSchema.index({ isActive: 1, companyId: 1 });

module.exports = mongoose.model('ShopSchedule', shopScheduleSchema);
