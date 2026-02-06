const ProductDailySnapshot = require('../models/ProductDailySnapshot');

/**
 * Inventory Report Service
 * Dedicated service for detailed Inventory Reporting
 * (Movement, Valuation, Stock Status)
 */
class InventoryReportService {

    /**
     * Get Company Inventory Report (Aggregated by Shop with Product Hierarchy)
     */
    static async getCompanyInventoryReport(companyId, startDate, endDate) {
        // Fetch all product snapshots for the period
        const snapshots = await ProductDailySnapshot.find({
            companyId,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 }).lean(); // Sort by date to ensure Open/Close integrity

        const branches = {};

        snapshots.forEach(snap => {
            if (!branches[snap.shopId]) {
                branches[snap.shopId] = {
                    shopId: snap.shopId,
                    totals: {
                        movement: { open: 0, in: 0, out: 0, close: 0 },
                        value: { totalValue: 0 }
                    },
                    products: {}
                };
            }
            const b = branches[snap.shopId];

            if (!b.products[snap.productId]) {
                const initialStock = snap.inventory?.initialStock || 0;
                b.products[snap.productId] = {
                    productId: snap.productId,
                    productName: snap.productName || 'Unknown Product',
                    category: snap.categoryName || snap.categoryId || 'Uncategorized',
                    movement: { open: initialStock, in: 0, out: 0, close: 0 },
                    value: { unitCost: 0, totalValue: 0 },
                    status: { reorderPoint: snap.status?.reorderPoint || 10, status: 'In Stock', age: 0 },
                    tracking: { lastRestock: null, lastMove: null }
                };
                b.totals.movement.open += initialStock;
            }
            const p = b.products[snap.productId];

            p.movement.in += (snap.movement?.in || 0);
            p.movement.out += (snap.movement?.out || 0);
            p.movement.close = snap.inventory?.remainingStock || 0;
            p.value.totalValue = snap.inventory?.stockValue || 0;
            p.value.unitCost = (p.movement.close > 0) ? (p.value.totalValue / p.movement.close) : 0;

            // Tracking bits
            if (snap.tracking?.lastRestock && (!p.tracking.lastRestock || new Date(snap.tracking.lastRestock) > new Date(p.tracking.lastRestock))) {
                p.tracking.lastRestock = snap.tracking.lastRestock;
            }
            if (snap.tracking?.lastMove && (!p.tracking.lastMove || new Date(snap.tracking.lastMove) > new Date(p.tracking.lastMove))) {
                p.tracking.lastMove = snap.tracking.lastMove;
            }

            // Calculate Status & Age
            if (p.movement.close === 0) p.status.status = 'Out of Stock';
            else if (p.movement.close <= p.status.reorderPoint) p.status.status = 'Low Stock';
            else p.status.status = 'In Stock';

            if (p.tracking.lastRestock) {
                const diffTime = Math.abs(new Date() - new Date(p.tracking.lastRestock));
                p.status.age = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        });

        // Finalize Branch Totals and Convert Product Maps to Arrays
        const branchList = Object.values(branches).map(b => {
            const productList = Object.values(b.products);
            b.totals.movement.in = productList.reduce((sum, p) => sum + p.movement.in, 0);
            b.totals.movement.out = productList.reduce((sum, p) => sum + p.movement.out, 0);
            b.totals.movement.close = productList.reduce((sum, p) => sum + p.movement.close, 0);
            b.totals.value.totalValue = productList.reduce((sum, p) => sum + p.value.totalValue, 0);

            return {
                ...b,
                products: productList
            };
        });

        return {
            companyId,
            period: { startDate, endDate },
            branches: branchList
        };
    }

    /**
     * Get Shop Inventory Report (Detailed Product List)
     * Matches the User's Image (Movement, Value, Status, Tracking)
     */
    static async getShopInventoryReport(companyId, shopId, startDate, endDate) {
        // Reuse hierarchical logic but filter for single shop and return flatter structure if preferred
        // Actually, let's keep it consistent: { shopId, totals, products }
        const report = await this.getCompanyInventoryReport(companyId, startDate, endDate);
        const branch = report.branches.find(b => b.shopId === shopId);

        return {
            companyId,
            shopId,
            period: { startDate, endDate },
            totals: branch ? branch.totals : null,
            products: branch ? branch.products : []
        };
    }
}

module.exports = InventoryReportService;
