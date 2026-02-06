const ProductDailySnapshot = require('../../models/ProductDailySnapshot');

/**
 * Handle 'inventory.stock.updated' event
 * Payload: { productId, companyId, shopId, quantityChange, newStockLevel, type, ... }
 */
module.exports = async (payload, routingKey) => {
    try {
        const { traceId, eventId } = payload;

        // 0. Idempotency Check
        const { processEventOnce } = require('../../utils/redisHelper');
        const isNew = await processEventOnce(traceId || eventId, 'report-inventory');
        if (!isNew) {
            console.log(`[InventoryHandler] Skipping duplicate event: ${traceId || eventId}`);
            return;
        }

        if (routingKey === 'inventory.product.deleted') {
            console.log(`[InventoryHandler] Product deleted: ${payload.productId || payload.id}. Cleanup logic would go here if needed.`);
            // Optionally remove from today's snapshot or just ignore further updates
            return;
        }

        if (routingKey === 'inventory.product.updated' || routingKey === 'inventory.product.created') {
            const pid = payload.productId || payload.id || payload._id;
            const cid = payload.companyId;

            if (pid && cid) {
                const internalServiceClient = require('../../utils/internalServiceClient');
                const productData = await internalServiceClient.getProductData(pid);
                if (productData) {
                    console.log(`[InventoryHandler] Syncing product metadata for: ${productData.productName}`);
                    const dateStr = new Date().toISOString().split('T')[0];
                    await ProductDailySnapshot.updateMany(
                        { productId: pid, companyId: cid, date: dateStr },
                        {
                            $set: {
                                productName: productData.productName,
                                categoryId: productData.categoryId,
                                categoryName: productData.categoryName
                            }
                        }
                    );
                }
            }
            return;
        }

        console.log(`[InventoryHandler] Processing stock update for: ${payload.productId}`);

        let {
            companyId, shopId, productId,
            type, // SALE, RESTOCK, etc.
            unitCost, productName, categoryId, categoryName
        } = payload;

        // Fallback for missing metadata (Optimization: ensures reports are never "Uncategorized")
        if (!productName || !categoryId || !categoryName) {
            const internalServiceClient = require('../../utils/internalServiceClient');
            const productData = await internalServiceClient.getProductData(productId);
            if (productData) {
                if (!productName) productName = productData.productName;
                if (!categoryId) categoryId = productData.categoryId;
                if (!categoryName) categoryName = productData.categoryName;
            }
        }

        const quantityChange = payload.quantityChange !== undefined ? payload.quantityChange : (payload.change !== undefined ? payload.change : payload.quantity);
        const newStockLevel = payload.newStockLevel !== undefined ? payload.newStockLevel : (payload.newQuantity !== undefined ? payload.newQuantity : payload.current);

        if (quantityChange === undefined || newStockLevel === undefined) {
            console.log(`[InventoryHandler] Incomplete stock update payload for ${productId}. Skipping.`);
            return;
        }

        const date = new Date();

        // 1. Update ProductDailySnapshot (The "Magical" Drill-down source)
        // We update the 'current' state of the product only.
        // History is kept in Analytics Service.
        const dateStr = date.toISOString().split('T')[0];

        const update = {
            $set: {
                "inventory.remainingStock": newStockLevel,
                "inventory.stockValue": (newStockLevel * (unitCost || 0)),
                "tracking.lastMove": date,
                "productName": productName,
                "categoryId": categoryId,
                "categoryName": payload.categoryName || payload.category || 'Uncategorized'
            },
            $setOnInsert: {
                "inventory.initialStock": (newStockLevel - quantityChange), // If today's first record, infer "Open"
                "productName": productName,
                "categoryId": categoryId,
                "categoryName": payload.categoryName || payload.category || 'Uncategorized'
            }
        };

        // Determine Direction (In vs Out)
        if (quantityChange > 0) {
            // RESTOCK or RETURN
            update.$inc = { "movement.in": quantityChange };
            update.$set["tracking.lastRestock"] = date;
        } else {
            // SALE or DAMAGE or THEFT
            update.$inc = { "movement.out": Math.abs(quantityChange) };
        }

        // Check Low Stock Status (Simple logic for now, ideally comes from config)
        const reorderPoint = 10; // Default
        update.$set["status.isLowStock"] = (newStockLevel <= reorderPoint);

        await ProductDailySnapshot.updateOne(
            { companyId, shopId, productId, date: dateStr },
            update,
            { upsert: true }
        );

        // 2. Invalidate Inventory Caches (Real-time stock updates)
        const { scanDel } = require('../../utils/redisHelper');
        // Invalidate specific Shop and Company Inventory reports
        scanDel(`REPORT:INVENTORY:${companyId}*`).catch(err => console.error("Cache invalidation error:", err));

    } catch (error) {
        console.error(`[InventoryHandler] Error:`, error);
        throw error;
    }
};
