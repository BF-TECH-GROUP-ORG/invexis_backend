const mongoose = require('mongoose');
const Stocktake = require('../models/Stocktake');
const StocktakeLine = require('../models/StocktakeLine');
const Product = require('../models/Product');
const ProductStock = require('../models/ProductStock');
const StockChange = require('../models/StockChange');
const logger = require('../utils/logger');
const { publishProductEvent } = require('../events/productEvents');
const Money = require('/app/shared/utils/MoneyUtil');

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Start a new physical stocktake session
 */
const startStocktake = asyncHandler(async (req, res) => {
    const { companyId, shopId, name, notes } = req.body;
    const userId = req.user?.id || 'system';

    if (!companyId || !shopId || !name) {
        return res.status(400).json({ success: false, message: 'Company ID, Shop ID, and Name are required' });
    }

    // 1. Create the stocktake session
    const stocktake = new Stocktake({
        companyId,
        shopId,
        name,
        notes,
        status: 'in_progress',
        createdBy: userId
    });
    await stocktake.save();

    // 2. Fetch all products in this shop
    const products = await Product.find({ companyId, shopId, isDeleted: false }).lean();

    // 3. Prepare line items with current expected stock
    const lines = [];
    for (const product of products) {
        const stockRecord = await ProductStock.findOne({ productId: product._id }).lean();
        const expectedQty = stockRecord?.stockQty || 0;
        // costPrice is stored as minor units in DB (e.g. 50000 for 500.00 RWF)
        const unitCost = product.costPrice || (product.pricingId?.cost) || 0;

        lines.push({
            stocktakeId: stocktake._id,
            productId: product._id,
            productName: product.name,
            sku: product.sku,
            expectedQty,
            actualQty: expectedQty, // Default to expected, staff will update discrepancies
            unitCost,
            reason: 'none',
            isCounted: false
        });
    }

    if (lines.length > 0) {
        await StocktakeLine.insertMany(lines);
    }

    res.status(201).json({
        success: true,
        message: 'Stocktake session started',
        data: {
            stocktakeId: stocktake._id,
            itemsCount: lines.length
        }
    });
});

/**
 * Update a specific line in a stocktake
 */
const updateStocktakeLine = asyncHandler(async (req, res) => {
    const { lineId } = req.params;
    const { actualQty, reason, note } = req.body;

    const line = await StocktakeLine.findById(lineId);
    if (!line) return res.status(404).json({ success: false, message: 'Stocktake line not found' });

    const stocktake = await Stocktake.findById(line.stocktakeId);
    if (stocktake.status !== 'in_progress') {
        return res.status(400).json({ success: false, message: 'Stocktake session is not in progress' });
    }

    line.actualQty = Number(actualQty);
    line.discrepancy = line.actualQty - line.expectedQty;
    line.discrepancyValue = line.discrepancy * line.unitCost;
    line.reason = reason || (line.discrepancy < 0 ? 'loss' : (line.discrepancy > 0 ? 'gain' : 'none'));
    line.note = note;
    line.isCounted = true;

    await line.save();

    res.status(200).json({ success: true, data: line });
});

/**
 * Complete and reconcile stocktake
 */
const completeStocktake = asyncHandler(async (req, res) => {
    const { stocktakeId } = req.params;
    const userId = req.user?.id || 'system';

    const stocktake = await Stocktake.findById(stocktakeId);
    if (!stocktake) return res.status(404).json({ success: false, message: 'Stocktake session not found' });
    if (stocktake.status !== 'in_progress') {
        return res.status(400).json({ success: false, message: 'Stocktake is already completed or cancelled' });
    }

    const lines = await StocktakeLine.find({ stocktakeId }).lean();

    let totalExpectedValue = 0;
    let totalActualValue = 0;
    let totalDiscrepancyValue = 0;
    let itemsWithDiscrepancy = 0;

    // Reconciliation Process
    for (const line of lines) {
        totalExpectedValue += (line.expectedQty * line.unitCost);
        totalActualValue += (line.actualQty * line.unitCost);

        if (line.discrepancy !== 0) {
            totalDiscrepancyValue += line.discrepancyValue;
            itemsWithDiscrepancy++;

            // Create StockChange to reconcile actual stock
            // This will trigger atomic updates to ProductStock and Outbox events
            try {
                await StockChange.create({
                    companyId: stocktake.companyId,
                    shopId: stocktake.shopId,
                    productId: line.productId,
                    userId: userId,
                    type: line.reason === 'damage' ? 'damage' : 'adjustment',
                    qty: line.discrepancy, // Can be positive or negative
                    previous: line.expectedQty,
                    reason: `Stocktake Reconciliation: ${stocktake.name} (${line.reason})`,
                    meta: {
                        productName: line.productName,
                        stocktakeId: stocktake._id
                    }
                });
            } catch (err) {
                console.error(`❌ Reconciliation failed for product ${line.productId}:`, err);
                logger.error(`Reconciliation failed for product ${line.productId}: ${err.message}`);
            }
        }
    }

    // Finalize Stocktake session
    stocktake.status = 'completed';
    stocktake.completedBy = userId;
    stocktake.completedAt = new Date();
    stocktake.totalExpectedValue = totalExpectedValue;
    stocktake.totalActualValue = totalActualValue;
    stocktake.totalDiscrepancyValue = totalDiscrepancyValue;
    stocktake.itemsCounted = lines.length;
    stocktake.itemsWithDiscrepancy = itemsWithDiscrepancy;

    await stocktake.save();

    // Emit summary event for analytics
    await publishProductEvent('inventory.stocktake.completed', {
        stocktakeId: stocktake._id,
        companyId: stocktake.companyId,
        shopId: stocktake.shopId,
        discrepancyValue: totalDiscrepancyValue,
        itemsCounted: lines.length
    });

    res.status(200).json({
        success: true,
        message: 'Stocktake completed and reconciled successfully',
        data: stocktake
    });
});

const getStocktakeDetails = asyncHandler(async (req, res) => {
    const { stocktakeId } = req.params;
    const stocktake = await Stocktake.findById(stocktakeId).lean();
    if (!stocktake) return res.status(404).json({ success: false, message: 'Stocktake not found' });

    const lines = await StocktakeLine.find({ stocktakeId }).lean();
    res.status(200).json({ success: true, stocktake, lines });
});

const listStocktakes = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.query;
    const query = { companyId };
    if (shopId) query.shopId = shopId;

    const list = await Stocktake.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: list });
});

module.exports = {
    startStocktake,
    updateStocktakeLine,
    completeStocktake,
    getStocktakeDetails,
    listStocktakes
};
