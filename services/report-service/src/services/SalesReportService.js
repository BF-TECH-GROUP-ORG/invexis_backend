const SalesTransaction = require('../models/SalesTransaction');
const moment = require('moment');

/**
 * Sales Report Service
 * Handles Detailed Transaction Reporting
 */
class SalesReportService {

    /**
     * Get Detailed Sales Report (Matches Reference Image)
     * 4-Layer Hierarchy: Company -> Branch -> Invoice -> Product
     */
    static async getDetailedSalesReport(companyId, shopId, startDate, endDate, page = 1, limit = 100) {
        // 1. Fetch Transactions
        const query = {
            companyId,
            date: { $gte: startDate, $lte: endDate }
        };
        if (shopId) query.shopId = shopId;

        const skip = (page - 1) * limit;
        const total = await SalesTransaction.countDocuments(query);
        const transactions = await SalesTransaction.find(query)
            .sort({ date: -1, saleTime: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // 2. Global Company Summary
        const companySummary = {
            totalRevenue: 0,
            totalQty: 0,
            totalReturns: 0,
            netQty: 0,
            transactionCount: total
        };

        // 3. Hierarchical Grouping (Branch -> Invoice -> Items)
        const branches = {};

        transactions.forEach(tx => {
            if (!branches[tx.shopId]) {
                branches[tx.shopId] = {
                    shopId: tx.shopId,
                    branchTotals: {
                        revenue: 0,
                        qtySold: 0,
                        returns: 0,
                        netQty: 0
                    },
                    invoices: []
                };
            }
            const b = branches[tx.shopId];

            // Format Invoice for the 4-layer view
            const formattedInvoice = {
                invoiceNo: tx.invoiceNo,
                customer: tx.customer?.name || 'Walk-in',
                customerType: tx.customer?.type || 'Retail',
                saleTime: tx.saleTime || moment(tx.date).format('hh:mm A'),
                soldBy: tx.soldBy || 'System', // Header level
                items: tx.items.map(item => {
                    const i = {
                        productId: item.productId,
                        productName: item.productName || 'Unknown Product',
                        qtySold: item.qtySold || 0,
                        returns: item.returns || 0,
                        netQty: item.netQty || (item.qtySold - item.returns),
                        unitPrice: item.unitPrice || 0,
                        totalAmount: item.totalAmount || 0,
                        soldBy: item.soldBy || tx.soldBy || 'System' // Item level tracking column
                    };

                    // Aggregate Branch Totals
                    b.branchTotals.revenue += i.totalAmount;
                    b.branchTotals.qtySold += i.qtySold;
                    b.branchTotals.returns += i.returns;
                    b.branchTotals.netQty += i.netQty;

                    // Aggregate Company Totals
                    companySummary.totalRevenue += i.totalAmount;
                    companySummary.totalQty += i.qtySold;
                    companySummary.totalReturns += i.returns;
                    companySummary.netQty += i.netQty;

                    return i;
                })
            };

            b.invoices.push(formattedInvoice);
        });

        return {
            companyId,
            period: { startDate, endDate },
            summary: companySummary,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            },
            branches: Object.values(branches)
        };
    }
}

module.exports = SalesReportService;
