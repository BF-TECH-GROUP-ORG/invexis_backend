const SalesTransaction = require('../models/SalesTransaction');
const moment = require('moment');

/**
 * Debt Report Service
 * "Intelligent" Debt Tracking & Aging
 */
class DebtReportService {

    /**
     * Get Detailed Debt Report
     * Filters only transactions with Debt (or History of Debt)
     */
    static async getDetailedDebtReport(companyId, shopId, startDate, endDate, page = 1, limit = 100) {
        const query = {
            companyId,
            date: { $gte: startDate, $lte: endDate },
            "debt.isDebt": true
        };
        if (shopId) query.shopId = shopId;

        const skip = (page - 1) * limit;
        const total = await SalesTransaction.countDocuments(query);
        const transactions = await SalesTransaction.find(query)
            .sort({ date: -1, shopId: 1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const internalServiceClient = require('../utils/internalServiceClient');
        const groups = {}; // Map of date -> { branches: { shopId: { name, invoices: [] } } }

        for (const tx of transactions) {
            const dateStr = moment(tx.date).format('MM/DD/YYYY');

            if (!groups[dateStr]) {
                groups[dateStr] = {
                    date: dateStr,
                    branches: {}
                };
            }

            if (!groups[dateStr].branches[tx.shopId]) {
                const shopData = await internalServiceClient.getShopData(tx.shopId);
                groups[dateStr].branches[tx.shopId] = {
                    shopId: tx.shopId,
                    shopName: shopData?.name || `Branch ${tx.shopId.substring(0, 6).toUpperCase()}`,
                    invoices: []
                };
            }

            // Real-time Aging & Status Calculation
            const today = moment().startOf('day');
            const dueDate = moment(tx.debt.dueDate).startOf('day');
            const saleDate = moment(tx.date).startOf('day');

            let status = 'Pending';
            let age = today.diff(saleDate, 'days');

            if (tx.debt.balance <= 0) {
                status = 'Paid';
            } else if (today.isAfter(dueDate)) {
                status = 'Overdue';
            }

            groups[dateStr].branches[tx.shopId].invoices.push({
                invoiceNo: tx.invoiceNo,
                customer: {
                    name: tx.customer.name,
                    phone: tx.customer.phone
                },
                debt: {
                    original: tx.debt.originalAmount,
                    paid: tx.debt.amountPaid,
                    balance: tx.debt.balance
                },
                payment: {
                    lastPaid: tx.debt.lastPaymentDate ? moment(tx.debt.lastPaymentDate).format('MM/DD/YYYY') : '-',
                    dueDate: tx.debt.dueDate ? moment(tx.debt.dueDate).format('MM/DD/YYYY') : '-'
                },
                status: {
                    status: status,
                    age: age
                },
                tracking: {
                    saleDate: moment(tx.date).format('MM/DD/YYYY'),
                    recordedBy: tx.soldBy
                }
            });
        }

        // Convert nested objects to sorted arrays
        const formattedGroups = Object.values(groups).map(group => ({
            date: group.date,
            branches: Object.values(group.branches)
        }));

        return {
            companyId,
            period: { startDate, endDate },
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            },
            groups: formattedGroups
        };
    }
}

module.exports = DebtReportService;
