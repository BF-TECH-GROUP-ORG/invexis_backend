const PaymentLog = require('../models/PaymentLog');
const moment = require('moment');

/**
 * Payment Report Service
 * Detailed Money Flow Reporting
 */
class PaymentReportService {

    /**
     * Get Detailed Payment Report
     */
    static async getDetailedPaymentReport(companyId, shopId, startDate, endDate, page = 1, limit = 100) {
        const query = {
            companyId,
            date: { $gte: startDate, $lte: endDate }
        };
        if (shopId) query.shopId = shopId;

        const skip = (page - 1) * limit;
        const total = await PaymentLog.countDocuments(query);
        const payments = await PaymentLog.find(query)
            .sort({ date: -1, time: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const internalServiceClient = require('../utils/internalServiceClient');
        const groups = {}; // Map of date -> { branches: { shopId: { name, invoices: [] } } }

        // Metrics trackers
        let totalReceived = 0;
        let pendingPayments = 0;
        let failedPayments = 0;
        let completedCount = 0;

        for (const pay of payments) {
            const dateStr = moment(pay.date).format('MM/DD/YYYY');

            // Calculate Metrics
            const statusLower = (pay.status || '').toLowerCase();
            if (statusLower === 'completed' || statusLower === 'success') {
                totalReceived += pay.amount;
                completedCount++;
            } else if (statusLower === 'pending') {
                pendingPayments += pay.amount;
            } else if (statusLower === 'failed' || statusLower === 'rejected') {
                failedPayments += pay.amount;
            }

            if (!groups[dateStr]) {
                groups[dateStr] = {
                    date: dateStr,
                    branches: {}
                };
            }

            if (!groups[dateStr].branches[pay.shopId]) {
                const shopData = await internalServiceClient.getShopData(pay.shopId);
                groups[dateStr].branches[pay.shopId] = {
                    shopId: pay.shopId,
                    shopName: shopData?.name || `Branch ${pay.shopId.substring(0, 6).toUpperCase()}`,
                    payments: []
                };
            }

            groups[dateStr].branches[pay.shopId].payments.push({
                paymentId: pay.paymentId,
                date: moment(pay.date).format('MM/DD/YYYY'),
                receivedBy: pay.receivedBy || 'System',
                customer: {
                    name: pay.customer?.name || 'Walk-in',
                    phone: pay.customer?.phone || 'N/A'
                },
                invoiceNo: pay.invoiceNo,
                payment: {
                    amount: pay.amount,
                    method: pay.method || 'CASH'
                },
                status: pay.status || 'Completed',
                reference: {
                    ref: pay.referenceType === 'SALE' ? `SALE-${pay.referenceId ? pay.referenceId.substring(0, 4).toUpperCase() : '...'}` : `DEBT-${pay.referenceId ? pay.referenceId.substring(0, 4).toUpperCase() : '...'}`,
                    type: pay.referenceType,
                    time: pay.time || moment(pay.createdAt).format('hh:mm A')
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
            metrics: {
                totalReceived,
                pendingPayments,
                failedPayments,
                avgPaymentSize: completedCount > 0 ? Math.round(totalReceived / completedCount) : 0
            },
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

module.exports = PaymentReportService;
