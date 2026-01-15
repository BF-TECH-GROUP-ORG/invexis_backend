const AuditReport = require('../../models/AuditReport');
const logger = require('../../config/logger');

const handle = async (event) => {
    const { type, data, timestamp } = event;
    const date = new Date(timestamp || Date.now());
    const day = date.toISOString().split('T')[0];

    const filter = {
        companyId: data.companyId,
        'period.day': day
    };

    try {
        await AuditReport.findOneAndUpdate(
            filter,
            {
                $inc: {
                    totalActions: 1,
                    criticalActions: data.isCritical ? 1 : 0,
                    securityIncidents: type === 'permission.violation' ? 1 : 0
                },
                $push: {
                    actionLog: {
                        action: type,
                        performedBy: data.userId,
                        timestamp: date,
                        details: data.details || JSON.stringify(data)
                    }
                },
                $set: {
                    level: 'company',
                    sourceService: 'audit-service', // or deriving service
                    'period.month': day.slice(0, 7),
                    'period.year': day.slice(0, 4)
                }
            },
            { upsert: true, new: true }
        );
        logger.info(`Logged audit action for company ${data.companyId}`);
    } catch (err) {
        logger.error('Error in audit handler:', err);
        throw err;
    }
};

module.exports = { handle };
