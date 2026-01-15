const mongoose = require('mongoose');
const BaseReportSchema = require('./BaseReportSchema');

const AuditReportSchema = new mongoose.Schema({
    ...BaseReportSchema,
    totalActions: { type: Number, default: 0 },
    criticalActions: { type: Number, default: 0 },
    securityIncidents: { type: Number, default: 0 },
    actionLog: [{
        action: String,
        performedBy: String, // UserId or Name
        timestamp: Date,
        details: String
    }]
}, { timestamps: true });

AuditReportSchema.index({ companyId: 1, 'period.day': 1 });

module.exports = mongoose.model('AuditReport', AuditReportSchema);
