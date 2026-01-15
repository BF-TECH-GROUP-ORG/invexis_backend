const CompanyReport = require('../../models/CompanyReport');
const ShopReport = require('../../models/ShopReport');
const SystemReport = require('../../models/SystemReport');
const logger = require('../../config/logger');

const handle = async (event) => {
    const { type, data, timestamp } = event;
    const date = new Date(timestamp || Date.now());
    const day = date.toISOString().split('T')[0];
    const month = day.slice(0, 7);
    const year = date.getFullYear().toString();

    try {
        if (type === 'company.created') {
            const companyFilter = { companyId: data.companyId, 'period.month': month };
            await CompanyReport.findOneAndUpdate(
                companyFilter,
                {
                    $set: {
                        subscriptionTier: data.tier || 'Basic',
                        level: 'company',
                        sourceService: 'company-service',
                        'period.year': year
                    }
                },
                { upsert: true, new: true }
            );

            // System Level update
            await SystemReport.findOneAndUpdate(
                { systemId: 'INVEXIS', 'period.day': day },
                {
                    $inc: { totalCompanies: 1 },
                    $set: {
                        level: 'system',
                        'period.month': month,
                        'period.year': year
                    }
                },
                { upsert: true, new: true }
            );

        } else if (type === 'shop.created' || type === 'shop.updated') {
            const { companyId, shopId, name, location } = data;

            // 1. Update CompanyReport counts (only on creation)
            if (type === 'shop.created') {
                await CompanyReport.findOneAndUpdate(
                    { companyId, 'period.month': month },
                    { $inc: { activeShops: 1 } },
                    { upsert: true }
                );
            }

            // 2. Store Metadata in ShopReport or BranchPerformance
            // We use BranchPerformance for historical lookups and name mapping
            await BranchPerformance.findOneAndUpdate(
                { companyId, shopId, date: day },
                {
                    $set: {
                        shopName: name || data.shopName,
                        location: location || data.location
                    }
                },
                { upsert: true }
            );
        }
        logger.info(`Processed system/company event: ${type}`);
    } catch (err) {
        logger.error('Error in company/system handler:', err);
        throw err;
    }
};

module.exports = { handle };
