const DailySnapshot = require('../models/DailySnapshot');
const ProductDailySnapshot = require('../models/ProductDailySnapshot');
const moment = require('moment');

/**
 * General Report Service
 * Handles the "Magical" Hierarchical Business Report
 * Levels: Company -> Shop (Branch) -> Product
 */
class GeneralReportService {

    /**
     * Get Company-Level Overview (Aggregated Branch Data with Product Drill-down)
     * "The Big Picture"
     */
    static async getCompanyGeneralReport(companyId, startDate, endDate) {
        // 1. Fetch all Shop & Product Snapshots for the period
        const [shopSnapshots, productSnapshots] = await Promise.all([
            DailySnapshot.find({
                companyId,
                date: { $gte: startDate, $lte: endDate }
            }).sort({ date: 1 }).lean(),
            ProductDailySnapshot.find({
                companyId,
                date: { $gte: startDate, $lte: endDate }
            }).sort({ date: 1 }).lean()
        ]);

        // 2. Process Branches and their products
        const branches = {};

        // 2a. Group Shop Snapshots for Branch Totals
        shopSnapshots.forEach(snap => {
            if (!branches[snap.shopId]) {
                branches[snap.shopId] = {
                    shopId: snap.shopId,
                    totals: this._initTotals(),
                    products: {} // Map for product aggregation within this branch
                };
                branches[snap.shopId].totals.inventory.initial = snap.inventory?.totalValue || 0;
            }
            branches[snap.shopId].totals.inventory.remaining = snap.inventory?.totalValue || 0;
            branches[snap.shopId].totals.inventory.stockValue = snap.inventory?.totalValue || 0;

            this._accumulateTotals(branches[snap.shopId].totals, snap);
        });

        // 2b. Aggregate Products within their respective branches
        productSnapshots.forEach(snap => {
            const branch = branches[snap.shopId];
            if (!branch) return; // Snapshot for branch missing?

            if (!branch.products[snap.productId]) {
                branch.products[snap.productId] = {
                    productId: snap.productId,
                    productName: snap.productName,
                    stats: this._initTotals()
                };
                branch.products[snap.productId].stats.inventory.initial = snap.inventory?.initialStock || 0;
            }
            branch.products[snap.productId].stats.inventory.remaining = snap.inventory?.remainingStock || 0;
            branch.products[snap.productId].stats.inventory.stockValue = snap.inventory?.stockValue || 0;

            this._accumulateProductTotals(branch.products[snap.productId].stats, snap);
        });

        // 3. Finalize Branch Data (Calculate Products Array & Margins)
        const branchList = Object.values(branches).map(b => {
            const productList = Object.values(b.products).map(p => {
                this._calculateMargins(p.stats);
                return p;
            });

            this._calculateMargins(b.totals);
            return {
                ...b,
                products: productList
            };
        });

        // 4. Grand Total
        const grandTotal = this._initTotals();
        branchList.forEach(b => {
            this._accumulateBranchStat(grandTotal, b.totals);
        });

        // Summing Point-in-Time metrics for the grand total
        grandTotal.inventory.initial = branchList.reduce((sum, b) => sum + b.totals.inventory.initial, 0);
        grandTotal.inventory.remaining = branchList.reduce((sum, b) => sum + b.totals.inventory.remaining, 0);
        grandTotal.inventory.stockValue = branchList.reduce((sum, b) => sum + b.totals.inventory.stockValue, 0);

        this._calculateMargins(grandTotal);

        return {
            companyId,
            period: { startDate, endDate },
            grandTotal,
            branches: branchList
        };
    }

    /**
     * Get Detailed Branch Report (With Product Drill-down)
     * "The Detailed View"
     */
    static async getShopGeneralReport(companyId, shopId, startDate, endDate) {
        // 1. Fetch Product Snapshots, SORTED by date to preserve initial/remaining integrity
        const productSnapshots = await ProductDailySnapshot.find({
            companyId,
            shopId,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 }).lean();

        // 2. Aggregate per Product
        const products = {};

        productSnapshots.forEach(snap => {
            if (!products[snap.productId]) {
                products[snap.productId] = {
                    productId: snap.productId,
                    productName: snap.productName,
                    stats: this._initTotals()
                };
                // Capture first-day initial stock
                products[snap.productId].stats.inventory.initial = snap.inventory.initialStock;
            }
            // Continuous update of the latest remaining stock
            products[snap.productId].stats.inventory.remaining = snap.inventory.remainingStock;
            products[snap.productId].stats.inventory.stockValue = snap.inventory.stockValue;

            this._accumulateProductTotals(products[snap.productId].stats, snap);
        });

        // 3. Shop Total
        const shopTotal = this._initTotals();
        Object.values(products).forEach(p => {
            this._accumulateBranchStat(shopTotal, p.stats);
            this._calculateMargins(p.stats);
        });
        this._calculateMargins(shopTotal);

        return {
            companyId,
            shopId,
            period: { startDate, endDate },
            shopTotal,
            products: Object.values(products)
        };
    }

    // --- Helpers ---

    static _initTotals() {
        return {
            inventory: { initial: 0, remaining: 0, stockValue: 0 },
            sales: { gross: 0, discounts: 0, net: 0 },
            payments: { received: 0, pending: 0 },
            debt: { incurred: 0, repaid: 0, balance: 0 }, // Added "balance" (Remaining)
            financials: { cost: 0, profit: 0, margin: 0 }
        };
    }

    static _accumulateTotals(target, snap) {
        // Mapping from DailySnapshot schema to Report Schema
        target.sales.gross += (snap.sales.totalRevenue + snap.sales.discountTotal); // Approx gross
        target.sales.discounts += snap.sales.discountTotal;
        target.sales.net += snap.sales.totalRevenue;

        target.payments.received += snap.finance.cashIn;
        target.payments.pending += snap.finance.debtIncurred;

        // Debt Specifics
        target.debt.incurred += snap.finance.debtIncurred;
        target.debt.repaid += snap.finance.debtRepaid;
        target.debt.balance += (snap.finance.debtIncurred - snap.finance.debtRepaid);

        target.financials.cost += snap.sales.totalCost;
        target.financials.profit += snap.sales.grossProfit;

        // Inventory is point-in-time, tricky to sum over time. 
        // Usually, for a range, "Initial" is start_date initial, "Remaining" is end_date remaining.
        // We'll approximate for now or assume single-day query usually.
        target.inventory.stockValue = snap.inventory.totalValue; // Use latest (simple rewrite)
    }

    static _accumulateProductTotals(target, snap) {
        target.sales.gross += snap.sales.grossSales;
        target.sales.discounts += snap.sales.discounts;
        target.sales.net += snap.sales.netSales;

        target.payments.received += snap.financials.amountReceived;
        target.payments.pending += snap.financials.amountPending;

        // Product level usually doesn't track "Debt Repaid" (that's per customer/transaction), 
        // but it tracks "Pending" (Credit Sales for this product)
        target.debt.incurred += snap.financials.amountPending;
        target.debt.repaid += 0; // Not tracked at product level individually
        target.debt.balance += (snap.financials.amountPending - 0);

        target.financials.cost += snap.financials.costOfGoods;
        target.financials.profit += snap.financials.grossProfit;
    }

    static _accumulateBranchStat(target, source) {
        target.inventory.stockValue += source.inventory.stockValue;
        target.sales.gross += source.sales.gross;
        target.sales.discounts += source.sales.discounts;
        target.sales.net += source.sales.net;
        target.payments.received += source.payments.received;
        target.payments.pending += source.payments.pending;
        target.debt.incurred += source.debt.incurred;
        target.debt.repaid += source.debt.repaid;
        target.debt.balance += source.debt.balance;
        target.financials.cost += source.financials.cost;
        target.financials.profit += source.financials.profit;
    }

    static _calculateMargins(stats) {
        if (stats.sales.net > 0) {
            stats.financials.margin = ((stats.financials.profit / stats.sales.net) * 100).toFixed(1);
        } else {
            stats.financials.margin = 0;
        }
    }
}

module.exports = GeneralReportService;
