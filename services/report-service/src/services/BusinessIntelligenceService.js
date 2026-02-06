const DailySnapshot = require('../models/DailySnapshot');
const moment = require('moment');

/**
 * Business Intelligence Service
 * "The Emotional Engine" - Visualizing Success
 */
class BusinessIntelligenceService {

    /**
     * Get Performance Charts
     * Supports: Daily (Hourly - mocked/future), Weekly (7 Days), Monthly (Days), Yearly (Months)
     */
    static async getPerformanceOverview(companyId, shopId, period, date) {

        // Determine Date Range based on Period
        let startDate, endDate;
        const referenceDate = date ? moment(date) : moment();

        if (period === 'Yearly') {
            startDate = referenceDate.clone().startOf('year');
            endDate = referenceDate.clone().endOf('year');
        } else if (period === 'Monthly') {
            startDate = referenceDate.clone().startOf('month');
            endDate = referenceDate.clone().endOf('month');
        } else if (period === 'Weekly') {
            startDate = referenceDate.clone().startOf('isoWeek');
            endDate = referenceDate.clone().endOf('isoWeek');
        } else {
            // Default to Monthly
            startDate = referenceDate.clone().startOf('month');
            endDate = referenceDate.clone().endOf('month');
        }

        const query = {
            companyId,
            date: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
            }
        };
        if (shopId) query.shopId = shopId;

        const snapshots = await DailySnapshot.find(query).sort({ date: 1 }).lean();

        // Transform Data for Chart
        // We need to fill in gaps if days are missing?
        // Let's assume sparse data is okay for now, or fill logic if strict.
        // Image shows continuous bars 1...31. Better to fill zeros.

        const chartData = [];
        const cursor = startDate.clone();

        // 1. Map Snapshots for O(1) Lookup
        const snapshotMap = {};
        snapshots.forEach(s => {
            snapshotMap[s.date] = s;
        });

        // 2. Iterate through time range
        while (cursor.isSameOrBefore(endDate)) {
            const dateStr = cursor.format('YYYY-MM-DD');
            const label = BusinessIntelligenceService.getLabel(period, cursor); // e.g. "1", "Jan", "Mon"

            const dayData = snapshotMap[dateStr] || {
                sales: { netProfit: 0, netSales: 0 },
                inventory: { totalValue: 0 },
                finance: { debtIncurred: 0, cashIn: 0 }
            };

            chartData.push({
                date: dateStr,
                label: label,

                // The 4 Metrics from the Image
                inventoryValue: dayData.inventory.totalValue || 0,
                netSales: dayData.sales.netSales || 0,
                outstandingDebts: dayData.finance.debtIncurred || 0, // Visualizing New Debt Flow
                paymentsReceived: dayData.finance.cashIn || 0
            });

            // Increment
            if (period === 'Yearly') cursor.add(1, 'month');
            else cursor.add(1, 'day');
        }

        // Aggregate Totals for the "Big Numbers" usually above charts
        const totals = chartData.reduce((acc, cur) => ({
            inventoryValue: cur.inventoryValue, // Usually take latest for Stock? Or Avg? Chart shows bars.
            netSales: acc.netSales + cur.netSales,
            outstandingDebts: acc.outstandingDebts + cur.outstandingDebts,
            paymentsReceived: acc.paymentsReceived + cur.paymentsReceived
        }), { inventoryValue: 0, netSales: 0, outstandingDebts: 0, paymentsReceived: 0 });

        // For Inventory Total, take the *latest* non-zero value or just the last day's value
        // as summing inventory stock over time is wrong.
        const lastEntry = chartData[chartData.length - 1];
        totals.inventoryValue = lastEntry.inventoryValue;


        return {
            companyId,
            period,
            selectedDate: referenceDate.format('YYYY-MM-DD'),
            totals,
            chartData
        };
    }

    static getLabel(period, cursor) {
        if (period === 'Yearly') return cursor.format('MMM'); // Jan, Feb
        if (period === 'Monthly') return cursor.format('D'); // 1, 2, 3
        if (period === 'Weekly') return cursor.format('ddd'); // Mon, Tue
        return cursor.format('D');
    }
}

module.exports = BusinessIntelligenceService;
