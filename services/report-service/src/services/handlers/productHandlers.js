const SalesAggregate = require('../../models/SalesAggregate');
const InventorySnapshot = require('../../models/InventorySnapshot');
const ProductRegistry = require('../../models/ProductRegistry');
const logger = require('../../config/logger');

const handle = async (event) => {
    const { type, data, timestamp } = event;
    const dateObj = new Date(timestamp || Date.now());
    const day = dateObj.toISOString().split('T')[0];

    try {
        if (type === 'inventory.product.created' || type === 'inventory.product.updated') {
            const { productId, companyId, name, inventory, pricing, sku, category } = data;

            // 1. Update/Sync Product Registry (for "All Products" reporting)
            await ProductRegistry.findOneAndUpdate(
                { companyId, productId },
                {
                    $set: {
                        name: name || data.name,
                        sku: sku || data.sku,
                        category: category || data.category,
                        unitCost: pricing?.costPrice || data.costPrice || 0,
                        active: true
                    }
                },
                { upsert: true }
            );

            await SalesAggregate.updateMany(
                { companyId, productId },
                { $set: { productName: name } }
            );

            await InventorySnapshot.updateMany(
                { companyId, productId },
                { $set: { productName: name } }
            );

            logger.info(`🏷️ Synced product registry for ${productId}: ${name}`);
        }
    } catch (err) {
        logger.error('Error in product handler:', err);
    }
};

module.exports = { handle };
