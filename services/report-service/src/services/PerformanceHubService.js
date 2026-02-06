const SalesTransaction = require('../models/SalesTransaction');
const moment = require('moment');

/**
 * Performance Hub Service
 * Aggregates High-Level KPI for Branches and Staff
 */
class PerformanceHubService {

    /**
     * Get Branch Performance Report
     * Matches Image: Branch Name, Location, Transactions, Revenue, Avg / Transaction, Active Staff, Status
     */
    static async getBranchPerformance(companyId, shopId, startDate, endDate) {
        const query = {
            companyId,
            date: { $gte: startDate, $lte: endDate }
        };
        if (shopId) query.shopId = shopId;

        const txns = await SalesTransaction.find(query).lean();
        const internalServiceClient = require('../utils/internalServiceClient');
        const branchStats = {};

        for (const tx of txns) {
            if (!branchStats[tx.shopId]) {
                const shopData = await internalServiceClient.getShopData(tx.shopId);
                branchStats[tx.shopId] = {
                    branchName: shopData?.name || `Branch ${tx.shopId.substring(0, 6).toUpperCase()}`,
                    location: shopData?.location || shopData?.address || 'Unknown',
                    transactions: 0,
                    revenue: 0,
                    staffSet: new Set()
                };
            }

            const b = branchStats[tx.shopId];
            b.transactions += 1;
            b.revenue += tx.totalAmount;
            if (tx.soldBy) b.staffSet.add(tx.soldBy);
        }

        return Object.values(branchStats).map(b => ({
            branchName: b.branchName,
            location: b.location,
            transactions: b.transactions,
            revenue: b.revenue,
            avgTransaction: b.transactions > 0 ? Math.round(b.revenue / b.transactions) : 0,
            activeStaff: b.staffSet.size,
            status: b.transactions > 10 ? 'Performing' : 'Normal'
        }));
    }

    /**
     * Get Staff Performance Report
     * Matches Image: Staff Member, Role, Branch, Transactions, Revenue, Avg / Transaction, Status
     */
    static async getStaffPerformance(companyId, shopId, startDate, endDate) {
        const query = {
            companyId,
            date: { $gte: startDate, $lte: endDate }
        };
        if (shopId) query.shopId = shopId;

        const txns = await SalesTransaction.find(query).lean();
        const internalServiceClient = require('../utils/internalServiceClient');
        const staffStats = {};

        for (const tx of txns) {
            const staffId = tx.soldBy || 'System';
            if (!staffStats[staffId]) {
                const shopData = await internalServiceClient.getShopData(tx.shopId);
                staffStats[staffId] = {
                    staffMember: tx.soldBy || 'Unknown',
                    role: 'Sales Associate', // Role typically comes from Auth/Staff service, defaulting for now
                    branch: shopData?.name || `Branch ${tx.shopId.substring(0, 6).toUpperCase()}`,
                    transactions: 0,
                    revenue: 0
                };
            }

            const s = staffStats[staffId];
            s.transactions += 1;
            s.revenue += tx.totalAmount;
        }

        return Object.values(staffStats).map(s => ({
            staffMember: s.staffMember,
            role: s.role,
            branch: s.branch,
            transactions: s.transactions,
            revenue: s.revenue,
            avgTransaction: s.transactions > 0 ? Math.round(s.revenue / s.transactions) : 0,
            status: 'Active'
        }));
    }
}

module.exports = PerformanceHubService;
