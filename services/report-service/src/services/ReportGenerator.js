const Metric = require('../models/Metric');
const SalesAggregate = require('../models/SalesAggregate');
const InventorySnapshot = require('../models/InventorySnapshot');
const DebtAggregate = require('../models/DebtAggregate');
const PaymentAggregate = require('../models/PaymentAggregate');
const BranchPerformance = require('../models/BranchPerformance');
const ProductRegistry = require('../models/ProductRegistry');
const moment = require('moment');

class ReportGenerator {
    /**
     * Get X-Axis labels based on filter type
     */
    getXAxis(filter, date = new Date()) {
        const labels = [];
        const m = moment(date);

        switch (filter) {
            case 'daily':
                for (let i = 0; i < 24; i++) {
                    labels.push(`${String(i).padStart(2, '0')}:00`);
                }
                break;
            case 'weekly':
                const startOfWeek = m.clone().startOf('isoWeek');
                for (let i = 0; i < 7; i++) {
                    labels.push(startOfWeek.clone().add(i, 'days').format('dddd'));
                }
                break;
            case 'monthly':
                const startOfMonth = m.clone().startOf('month');
                const endOfMonth = m.clone().endOf('month');
                // By week: Week 1, Week 2...
                const weeksInMonth = Math.ceil(endOfMonth.date() / 7);
                for (let i = 1; i <= weeksInMonth; i++) {
                    labels.push(`Week ${i}`);
                }
                break;
            case 'yearly':
                for (let i = 0; i < 12; i++) {
                    labels.push(moment().month(i).format('MMM'));
                }
                break;
        }
        return labels;
    }

    /**
     * Get Metric keys for a range based on filter
     */
    getMetricKeys(filter, date = new Date()) {
        const keys = [];
        const m = moment.utc(date);

        switch (filter) {
            case 'daily':
                const day = m.format('YYYY-MM-DD');
                for (let i = 0; i < 24; i++) {
                    keys.push(`${day}:${String(i).padStart(2, '0')}`);
                }
                break;
            case 'weekly':
                const startOfWeek = m.clone().startOf('isoWeek');
                for (let i = 0; i < 7; i++) {
                    keys.push(startOfWeek.clone().add(i, 'days').format('YYYY-MM-DD'));
                }
                break;
            case 'monthly':
                const daysInMonth = m.daysInMonth();
                for (let i = 1; i <= daysInMonth; i++) {
                    keys.push(m.clone().date(i).format('YYYY-MM-DD'));
                }
                break;
            case 'yearly':
                const year = m.format('YYYY');
                for (let i = 1; i <= 12; i++) {
                    keys.push(`${year}-${String(i).padStart(2, '0')}`);
                }
                break;
        }
        return keys;
    }

    /**
     * Fetch and format chart data
     */
    async getChartData(companyId, shopId, filter, date = new Date()) {
        const keys = this.getMetricKeys(filter, date);
        const type = filter === 'daily' ? 'hourly' :
            (filter === 'weekly' || filter === 'monthly') ? 'daily' : 'monthly';

        const metrics = await Metric.find({
            companyId,
            shopId: shopId || null,
            type,
            key: { $in: keys }
        }).lean();

        const metricsMap = metrics.reduce((acc, m) => {
            acc[m.key] = m;
            return acc;
        }, {});

        const xAxis = this.getXAxis(filter, date);
        const series = {
            netSales: [],
            outstandingDebts: [],
            paymentsReceived: [],
            inventoryValue: []
        };

        if (filter === 'monthly') {
            // Aggregate daily to weekly
            const weeks = [];
            for (let i = 0; i < xAxis.length; i++) {
                const weekMetrics = { netSales: 0, outstandingDebts: 0, paymentsReceived: 0, inventoryValue: 0, count: 0 };
                for (let j = 0; j < 7; j++) {
                    const dayIdx = i * 7 + j;
                    if (dayIdx >= keys.length) break;
                    const m = metricsMap[keys[dayIdx]] || {};
                    weekMetrics.netSales += m.netSales || 0;
                    weekMetrics.outstandingDebts += m.outstandingDebts || 0;
                    weekMetrics.paymentsReceived += m.paymentsReceived || 0;
                    weekMetrics.inventoryValue = Math.max(weekMetrics.inventoryValue, m.inventoryValue || 0);
                }
                series.netSales.push(weekMetrics.netSales);
                series.outstandingDebts.push(weekMetrics.outstandingDebts);
                series.paymentsReceived.push(weekMetrics.paymentsReceived);
                series.inventoryValue.push(weekMetrics.inventoryValue);
            }
        } else {
            keys.forEach(key => {
                const m = metricsMap[key] || {};
                series.netSales.push(m.netSales || 0);
                series.outstandingDebts.push(m.outstandingDebts || 0);
                series.paymentsReceived.push(m.paymentsReceived || 0);
                series.inventoryValue.push(m.inventoryValue || 0);
            });
        }

        return { filter, xAxis, series };
    }

    /**
     * Calculate Trends for KPI Cards
     */
    calculateTrend(current, previous) {
        if (!previous) return "+0%";
        const diff = ((current - previous) / previous) * 100;
        return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
    }

    /**
     * Get Performance Table data (Nested Branch -> Products)
     */
    async getPerformanceTable(companyId, shopId, filter, date = new Date()) {
        const day = moment.utc(date).format('YYYY-MM-DD');

        // 1. Fetch Data
        const [salesData, inventoryData, debtData, paymentData, allProducts] = await Promise.all([
            SalesAggregate.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            InventorySnapshot.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            DebtAggregate.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            PaymentAggregate.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            ProductRegistry.find({ companyId, active: true }).lean()
        ]);

        // Fetch Branch Names for resolution (Persistent Lookup)
        const [branchMetadata, salesMetadata] = await Promise.all([
            BranchPerformance.aggregate([
                { $match: { companyId } },
                { $sort: { date: -1 } },
                { $group: { _id: "$shopId", name: { $first: "$shopName" } } }
            ]),
            SalesAggregate.aggregate([
                { $match: { companyId } },
                { $sort: { updatedAt: -1 } },
                { $group: { _id: "$shopId", name: { $first: "$productName" } } } // Just used to find activity
            ])
        ]);

        const shopNameMap = {};
        branchMetadata.forEach(b => { if (b._id && b.name) shopNameMap[b._id] = b.name; });

        // Final Display Name helper (Aggressive discovery)
        const getShopName = (sId) => {
            if (!sId || sId === 'Main') return 'Main Branch';
            if (shopNameMap[sId]) return shopNameMap[sId];
            return `Shop ${sId.slice(0, 4)}...`;
        };

        const table = [];
        const grandTotal = this._emptyPerformanceRow('Total', 'Summary');

        if (!shopId) {
            // Group by Branch -> Products
            const branchMap = {};

            // Helper to ensure product structure exists
            const ensureProduct = (sId, prod) => {
                if (!branchMap[sId]) {
                    const displayName = getShopName(sId);
                    branchMap[sId] = this._emptyPerformanceRow(displayName, 'Branch');
                    branchMap[sId].products = {};
                }
                const pId = prod.productId || prod._id;
                if (!branchMap[sId].products[pId]) {
                    branchMap[sId].products[pId] = this._emptyPerformanceRow(prod.name || prod.productName || pId, 'Product');
                    branchMap[sId].products[pId].productId = pId;
                }
            };

            // Seed active shops
            const activeShops = new Set();
            salesData.forEach(s => activeShops.add(s.shopId || 'Main'));
            inventoryData.forEach(i => activeShops.add(i.shopId || 'Main'));
            debtData.forEach(d => activeShops.add(d.shopId || 'Main'));
            paymentData.forEach(p => activeShops.add(p.shopId || 'Main'));

            // Pre-populate all products for every GENUINELY active shop
            activeShops.forEach(sId => {
                // If sId is 'Main' and we have actual sales data with null shopId, or it's the only shop
                const hasData = salesData.some(s => (s.shopId || 'Main') === sId && s.netSales !== 0) ||
                    inventoryData.some(i => (i.shopId || 'Main') === sId && i.totalStockValue > 0);

                if (hasData || activeShops.size === 1) {
                    allProducts.forEach(p => ensureProduct(sId, p));
                }
            });

            // Processing Sales
            salesData.forEach(item => {
                const sId = item.shopId || 'Main';
                const pId = item.productId;
                ensureProduct(sId, item);

                const b = branchMap[sId];
                const p = branchMap[sId].products[pId];

                const itemGross = (item.grossSales !== undefined && item.grossSales !== null) ? item.grossSales : (item.netSales || 0);
                const itemDisc = item.discounts || 0;

                // Fallback for Received/Pending (if 0 but sales exist, assume received unless we know otherwise)
                let itemRec = item.amountReceived || 0;
                let itemPen = item.amountPending || 0;
                if (itemRec === 0 && itemPen === 0 && item.netSales !== 0) {
                    itemRec = item.netSales;
                }

                // Fallback for Cost (COGS recovery)
                let itemCostValue = item.totalCosts || 0;
                if (itemCostValue === 0 && item.netSales !== 0) {
                    const registryProd = allProducts.find(ap => ap.productId === pId);
                    if (registryProd && registryProd.unitCost) {
                        itemCostValue = (item.quantitySold || item.quantityReturned || 1) * registryProd.unitCost;
                        if (item.netSales < 0) itemCostValue = -Math.abs(itemCostValue);
                    }
                }

                p.grossSales += itemGross;
                p.discounts += itemDisc;
                p.netSales += (item.netSales || 0);
                p.cost += itemCostValue;
                p.received += itemRec;
                p.pending += itemPen;
                p.returnsCount += (item.quantityReturned || 0);

                b.grossSales += itemGross;
                b.discounts += itemDisc;
                b.netSales += (item.netSales || 0);
                b.cost += itemCostValue;
                b.received += itemRec;
                b.pending += itemPen;
                b.returnsCount += (item.quantityReturned || 0);

                grandTotal.grossSales += itemGross;
                grandTotal.discounts += itemDisc;
                grandTotal.netSales += (item.netSales || 0);
                grandTotal.cost += itemCostValue;
                grandTotal.received += itemRec;
                grandTotal.pending += itemPen;
                grandTotal.returnsCount += (item.quantityReturned || 0);
            });

            // Processing Inventory
            inventoryData.forEach(item => {
                const sId = item.shopId || 'Main';
                const pId = item.productId;
                ensureProduct(sId, item);

                const b = branchMap[sId];
                const p = branchMap[sId].products[pId];

                p.initialStock += (item.openingStock || 0);
                p.remainingStock += (item.closingStock || 0);
                p.stockValue += (item.totalStockValue || 0);

                b.initialStock += (item.openingStock || 0);
                b.remainingStock += (item.closingStock || 0);
                b.stockValue += (item.totalStockValue || 0);

                grandTotal.initialStock += (item.openingStock || 0);
                grandTotal.remainingStock += (item.closingStock || 0);
                grandTotal.stockValue += (item.totalStockValue || 0);
            });

            // Processing Debts
            debtData.forEach(item => {
                const sId = item.shopId || 'Main';
                const amt = item.totalAmount || 0;
                const paid = item.totalPaid || 0;
                const pend = item.outstandingBalance || 0;

                if (amt !== 0 || paid !== 0 || pend !== 0) {
                    if (!branchMap[sId]) branchMap[sId] = this._emptyPerformanceRow(getShopName(sId), 'Branch');
                    branchMap[sId].debtAmount += amt;
                    branchMap[sId].paidAmount += paid;
                    branchMap[sId].pending += pend;
                }

                grandTotal.debtAmount += amt;
                grandTotal.paidAmount += paid;
                grandTotal.pending += pend;
            });

            // Processing Payments
            paymentData.forEach(item => {
                const sId = item.shopId || 'Main';
                const amount = item.amount || 0;
                if (amount !== 0) {
                    if (!branchMap[sId]) branchMap[sId] = this._emptyPerformanceRow(getShopName(sId), 'Branch');
                    branchMap[sId].received += amount;
                }
                grandTotal.received += amount;
            });

            for (const sId in branchMap) {
                const branch = branchMap[sId];
                branch.netProfit = branch.netSales - branch.cost;
                branch.margin = branch.netSales > 0 ? (branch.netProfit / branch.netSales) * 100 : 0;

                const branchProducts = [];
                for (const pId in branch.products) {
                    const product = branch.products[pId];
                    product.netProfit = product.netSales - product.cost;
                    product.margin = product.netSales > 0 ? (product.netProfit / product.netSales) * 100 : 0;
                    branchProducts.push(product);
                }
                branch.products = branchProducts;
                table.push(branch);
            }

        } else {
            // Group by Product only
            const productMap = {};
            allProducts.forEach(p => {
                productMap[p.productId] = this._emptyPerformanceRow(p.name, 'Product');
            });

            salesData.forEach(item => {
                const pId = item.productId;
                if (!productMap[pId]) productMap[pId] = this._emptyPerformanceRow(item.productName || pId, 'Product');
                productMap[pId].grossSales += (item.grossSales || 0);
                productMap[pId].discounts += (item.discounts || 0);
                productMap[pId].netSales += (item.netSales || 0);
                productMap[pId].cost += (item.totalCosts || 0);
                productMap[pId].received += (item.amountReceived || 0);
                productMap[pId].pending += (item.amountPending || 0);
                productMap[pId].returnsCount += (item.quantityReturned || 0);
            });

            inventoryData.forEach(item => {
                const pId = item.productId;
                if (!productMap[pId]) productMap[pId] = this._emptyPerformanceRow(item.productName || pId, 'Product');
                productMap[pId].initialStock += (item.openingStock || 0);
                productMap[pId].remainingStock += (item.closingStock || 0);
                productMap[pId].stockValue += (item.totalStockValue || 0);
            });

            for (const pId in productMap) {
                const row = productMap[pId];
                row.netProfit = row.netSales - row.cost;
                row.margin = row.netSales > 0 ? (row.netProfit / row.netSales) * 100 : 0;
                table.push(row);
            }
        }

        // Finalize Grand Total
        grandTotal.netProfit = grandTotal.netSales - grandTotal.cost;
        grandTotal.margin = grandTotal.netSales > 0 ? (grandTotal.netProfit / grandTotal.netSales) * 100 : 0;
        table.push(grandTotal);

        return table;
    }

    /**
     * Backfill company-level metrics from branch metrics
     */
    async backfillCompanyMetrics(companyId, filter, date) {
        const type = filter === 'daily' ? 'daily' : filter;
        const key = this._getPeriodKey(filter, date);

        const branchMetrics = await Metric.find({
            companyId,
            shopId: { $ne: null },
            type,
            key
        }).lean();

        if (branchMetrics.length === 0) return null;

        const companyMetric = {
            companyId,
            shopId: null,
            type,
            key,
            netSales: 0,
            grossSales: 0,
            totalCosts: 0,
            returns: 0,
            transactionCount: 0,
            outstandingDebts: 0,
            paymentsReceived: 0,
            inventoryValue: 0
        };

        branchMetrics.forEach(m => {
            companyMetric.netSales += (m.netSales || 0);
            companyMetric.grossSales += (m.grossSales || 0);
            companyMetric.totalCosts += (m.totalCosts || 0);
            companyMetric.returns += (m.returns || 0);
            companyMetric.transactionCount += (m.transactionCount || 0);
            companyMetric.outstandingDebts += (m.outstandingDebts || 0);
            companyMetric.paymentsReceived += (m.paymentsReceived || 0);
            companyMetric.inventoryValue += (m.inventoryValue || 0);
        });

        return await Metric.findOneAndUpdate(
            { companyId, shopId: null, type, key },
            { $set: companyMetric },
            { upsert: true, new: true }
        );
    }

    /**
     * Calculate Trends for KPI Cards
     */
    async getTrendMetrics(companyId, shopId, filter, date) {
        const currentMetric = await Metric.findOne({
            companyId,
            shopId: shopId || null,
            type: filter === 'daily' ? 'daily' : filter,
            key: this._getPeriodKey(filter, date)
        }).lean();

        const previousDate = this._getPreviousPeriodDate(filter, date);
        const previousMetric = await Metric.findOne({
            companyId,
            shopId: shopId || null,
            type: filter === 'daily' ? 'daily' : filter,
            key: this._getPeriodKey(filter, previousDate)
        }).lean();

        const metricsList = [
            'netSales', 'totalCosts', 'returns', 'outstandingDebts', 'paymentsReceived', 'inventoryValue'
        ];

        const trends = {};
        metricsList.forEach(m => {
            const current = currentMetric ? (currentMetric[m] || 0) : 0;
            const previous = previousMetric ? (previousMetric[m] || 0) : 0;

            if (previous === 0) {
                trends[m] = current > 0 ? "Initial" : "0.0%";
            } else {
                const diff = ((current - previous) / Math.abs(previous || 1)) * 100;
                trends[m] = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
            }
        });

        // Add Net Profit Trend manually
        const curProfit = (currentMetric?.netSales || 0) - (currentMetric?.totalCosts || 0);
        const preProfit = (previousMetric?.netSales || 0) - (previousMetric?.totalCosts || 0);
        if (preProfit === 0) {
            trends.netProfit = curProfit > 0 ? "Initial" : "0.0%";
        } else {
            const diff = ((curProfit - preProfit) / Math.abs(preProfit || 1)) * 100;
            trends.netProfit = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
        }

        return trends;
    }

    /**
     * Rebuild a daily Metric from all aggregates (Self-Healing)
     */
    async rebuildMetricsFromAggregates(companyId, shopId, date) {
        const day = moment.utc(date).format('YYYY-MM-DD');

        const [sales, inventory, debts, payments, allProducts] = await Promise.all([
            SalesAggregate.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            InventorySnapshot.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            DebtAggregate.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            PaymentAggregate.find({ companyId, ...(shopId ? { shopId } : {}), date: day }).lean(),
            ProductRegistry.find({ companyId }).lean()
        ]);

        const metricData = {
            companyId,
            shopId: shopId || null,
            type: 'daily',
            key: day,
            netSales: 0,
            grossSales: 0,
            discounts: 0,
            totalCosts: 0,
            returns: 0,
            transactionCount: 0,
            inventoryValue: 0,
            outstandingDebts: 0,
            paymentsReceived: 0
        };

        sales.forEach(s => {
            const sNet = (s.netSales || 0);
            metricData.netSales += sNet;
            metricData.grossSales += (s.grossSales || (sNet + (s.discounts || 0)));
            metricData.discounts += (s.discounts || 0);

            // Cost Recovery
            let sCost = (s.totalCosts || 0);
            if (sCost === 0 && sNet !== 0) {
                // Try to find product in registry for cost
                const pReg = allProducts.find(pr => pr.productId === s.productId);
                if (pReg && pReg.unitCost) {
                    sCost = (s.quantitySold || s.quantityReturned || 1) * pReg.unitCost;
                    if (sNet < 0) sCost = -Math.abs(sCost);
                }
            }
            metricData.totalCosts += sCost;

            metricData.returns += (s.refundAmount || (sNet < 0 ? Math.abs(sNet) : 0));
            metricData.transactionCount += (s.transactionCount || 0);

            // Payment derivation from Sales (Fallback for missing Payment/Debt records)
            let sRec = s.amountReceived || 0;
            let sPen = s.amountPending || 0;
            if (sRec === 0 && sPen === 0 && sNet > 0) sRec = sNet; // Assume cash if unknown

            metricData.paymentsReceived += sRec;
            metricData.outstandingDebts += sPen;
        });

        inventory.forEach(i => {
            metricData.inventoryValue += (i.totalStockValue || 0);
        });

        // Recovery: If daily returns value is 0, check hourly metrics for negative sales "shadows" (Legacy Fallback)
        if (metricData.returns === 0) {
            const hourlyMetrics = await Metric.find({
                companyId,
                ...(shopId ? { shopId } : {}), // Scan all shops if company-level rebuild
                type: 'hourly',
                key: { $regex: `^${day}:` }
            }).lean();
            hourlyMetrics.forEach(hm => {
                if (hm.netSales < 0) metricData.returns += Math.abs(hm.netSales);
            });
        }

        // Add explicit payments/debts but minus what we already counted from sales to avoid double counting
        // In a perfect system, explicit records win. For now, we use a "Max" or "Sum unique" approach.
        // Simplified: use explicit records if they exist and are greater than derived.
        const explicitRec = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const explicitPen = debts.reduce((sum, d) => sum + (d.outstandingBalance || 0), 0);

        metricData.paymentsReceived = Math.max(metricData.paymentsReceived, explicitRec);
        metricData.outstandingDebts = Math.max(metricData.outstandingDebts, explicitPen);

        return await Metric.findOneAndUpdate(
            { companyId, shopId: shopId || null, type: 'daily', key: day },
            { $set: metricData },
            { upsert: true, new: true }
        );
    }

    _getPeriodKey(filter, date) {
        const d = moment.utc(date);
        if (filter === 'daily') return d.format('YYYY-MM-DD');
        if (filter === 'weekly') {
            const getWeek = (date) => {
                const tempDate = new Date(date.getTime());
                tempDate.setUTCHours(0, 0, 0, 0);
                tempDate.setUTCDate(tempDate.getUTCDate() + 3 - (tempDate.getUTCDay() + 6) % 7);
                const week1 = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 4));
                return 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getUTCDay() + 6) % 7) / 7);
            };
            const nativeDate = d.toDate();
            return `${d.year()}-${String(getWeek(nativeDate)).padStart(2, '0')}`;
        }
        if (filter === 'monthly') return d.format('YYYY-MM');
        if (filter === 'yearly') return String(d.year());
        return d.format('YYYY-MM-DD');
    }

    _getPreviousPeriodDate(filter, date) {
        const d = new Date(date);
        if (filter === 'daily') d.setUTCDate(d.getUTCDate() - 1);
        else if (filter === 'weekly') d.setUTCDate(d.getUTCDate() - 7);
        else if (filter === 'monthly') d.setUTCMonth(d.getUTCMonth() - 1);
        else if (filter === 'yearly') d.setUTCFullYear(d.getUTCFullYear() - 1);
        return d;
    }

    _emptyPerformanceRow(name, type) {
        return {
            name,
            type,
            initialStock: 0,
            remainingStock: 0,
            stockValue: 0,
            grossSales: 0,
            discounts: 0,
            netSales: 0,
            received: 0,
            pending: 0,
            debtAmount: 0,
            paidAmount: 0,
            cost: 0,
            netProfit: 0,
            margin: 0,
            returnsCount: 0
        };
    }
}

module.exports = new ReportGenerator();
