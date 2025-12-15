const SalesMetric = require("../models/SalesMetric.model");
const InventoryMetric = require("../models/InventoryMetric.model");
const sequelize = require("../config/database");

/**
 * IngestionController
 * Processes standardized events and writes to optimized metric tables (Hypertables).
 */

const IngestionController = {
    /**
     * Handle 'sale.created' event
     * Populates SalesMetric and InventoryMetric (for stock reduction)
     */
    async processSaleCreated(event) {
        const { data, source, emittedAt, id: sourceEventId } = event;
        const {
            companyId,
            shopId,
            totalAmount,
            items = [],
            customerId,
            paymentMethod,
        } = data;

        // 1. Record Sales Metric
        try {
            const revenue = parseFloat(totalAmount || 0);

            // Calculate Total Cost
            // items: [{ productId, quantity, unitPrice, costPrice, ... }]
            const totalCost = items.reduce((sum, item) => {
                const qty = item.quantity || 0;
                const cost = parseFloat(item.costPrice || 0);
                return sum + (qty * cost);
            }, 0);

            const profit = revenue - totalCost;

            // Idempotency Check
            const existing = await SalesMetric.findOne({ where: { sourceEventId } });
            if (existing) {
                 console.log(`⚠️ Ingestion: Duplicate SalesMetric for event ${sourceEventId} ignored.`);
                 return;
            }

            await SalesMetric.create({
                time: emittedAt || new Date(),
                companyId,
                shopId,
                amount: revenue,
                costAmount: totalCost,
                profit: profit,
                itemCount: items.length,
                customerId: customerId || null,
                paymentMethod: paymentMethod || "unknown",
                employeeId: data.soldBy || null,
                sourceEventId,
            });
            console.log(`📊 Ingestion: SalesMetric recorded for event ${sourceEventId} (Profit: ${profit})`);
        } catch (err) {
            console.error("❌ Ingestion: Failed to record SalesMetric:", err.message);
        }

        // 2. Record Inventory Metrics (Stock reduction)
        // Note: 'items' usually contains { productId, quantity }
        try {
            if (items && items.length > 0) {
                const inventoryRecords = items.map((item) => ({
                    time: emittedAt || new Date(),
                    companyId,
                    shopId, // assuming sale shopId aligns with inventory location
                    productId: item.productId,
                    category: item.category || "Uncategorized",
                    changeAmount: -1 * Math.abs(item.quantity || 0), // Negative for sale
                    operation: "sale",
                    sourceEventId,
                }));

                await InventoryMetric.bulkCreate(inventoryRecords);
                console.log(
                    `📊 Ingestion: ${inventoryRecords.length} InventoryMetrics recorded`
                );
            }
        } catch (err) {
            console.error(
                "❌ Ingestion: Failed to record InventoryMetrics:",
                err.message
            );
        }
    },

    /**
     * Handle 'inventory.stock.updated' (or similar)
     */
    async processInventoryUpdated(event) {
        const { data, source, emittedAt, id: sourceEventId } = event;
        const { companyId, shopId, productId, newStock, change, operation } = data;

        try {
            await InventoryMetric.create({
                time: emittedAt || new Date(),
                companyId,
                shopId: shopId || null,
                productId,
                changeAmount: change || 0,
                currentStock: newStock, // Snapshot
                operation: operation || "update",
                sourceEventId,
            });
            console.log(
                `📊 Ingestion: InventoryMetric recorded for product ${productId}`
            );
        } catch (err) {
            console.error(
                "❌ Ingestion: Failed to record InventoryMetric:",
                err.message
            );
        }
    },
};

module.exports = IngestionController;
