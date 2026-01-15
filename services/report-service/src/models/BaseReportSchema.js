const mongoose = require('mongoose');

const BaseReportSchema = {
    systemId: {
        type: String,
        required: true,
        default: 'INVEXIS',
        index: true
    },
    companyId: {
        type: String,
        default: null,
        index: true
    },
    shopId: {
        type: String,
        default: null,
        index: true
    },
    userId: {
        type: String,
        default: null,
        index: true
    },
    level: {
        type: String,
        enum: ['system', 'company', 'shop', 'user'],
        required: true
    },
    period: {
        type: {
            day: String,   // YYYY-MM-DD
            week: String,  // YYYY-WW
            month: String, // YYYY-MM
            year: String   // YYYY
        },
        required: true
    },
    sourceService: {
        type: String,
        required: true
    },
    rawData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
};

module.exports = BaseReportSchema;
