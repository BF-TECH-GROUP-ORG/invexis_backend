const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const Warehouse = require('../models/Warehouse');
const { validateMongoId } = require('../utils/validateMongoId');
const { logger } = require('../utils/logger');

/**
 * @desc    Get all products available for a specific shop
 * @route   GET /api/v1/inventory/shops/:shopId/products
 * @access  Private
 */
const getShopProducts = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const {
    page = 1,
    limit = 20,
    sort = 'sortOrder',
    status = 'active',
    category,
    brand,
    search,
    inStock,
    companyId
  } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'companyId is required'
    });
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query
  const query = {
    companyId,
    'shopAvailability.shopId': shopId,
    'shopAvailability.enabled': true
  };

  if (status) query.status = status;
  if (category) query.category = category;
  if (brand) query.brand = new RegExp(brand, 'i');
  if (search) {
    query.$text = { $search: search };
  }
  if (inStock === 'true') {
    query['inventory.perWarehouse'] = {
      $elemMatch: {
        warehouseId: shopId,
        quantity: { $gt: 0 }
      }
    };
  }

  const products = await Product.find(query)
    .populate('category subcategory')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Product.countDocuments(query);

  // Transform products to include shop-specific inventory
  const shopProducts = products.map(product => {
    const shopWarehouse = product.inventory.perWarehouse?.find(
      wh => wh.warehouseId.toString() === shopId
    );
    const shopAvail = product.shopAvailability?.find(
      sa => sa.shopId === shopId
    );

    return {
      ...product,
      shopInventory: {
        quantity: shopWarehouse?.quantity || 0,
        lowStockThreshold: shopWarehouse?.lowStockThreshold || product.inventory.lowStockThreshold,
        customPrice: shopAvail?.customPrice || null,
        effectivePrice: shopAvail?.customPrice || product.pricing.salePrice || product.pricing.basePrice
      }
    };
  });

  res.json({
    success: true,
    data: shopProducts,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

/**
 * @desc    Get inventory details for a specific product at a shop
 * @route   GET /api/v1/inventory/shops/:shopId/products/:productId
 * @access  Private
 */
const getShopProductInventory = asyncHandler(async (req, res) => {
  const { shopId, productId } = req.params;
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'companyId is required'
    });
  }

  validateMongoId(productId);

  const product = await Product.findOne({
    _id: productId,
    companyId
  }).populate('category subcategory');

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Get shop-specific inventory
  const shopInventory = product.getShopInventory(shopId);

  res.json({
    success: true,
    data: {
      productId: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      shopInventory
    }
  });
});

/**
 * @desc    Allocate inventory to a shop
 * @route   POST /api/v1/inventory/shops/:shopId/allocate
 * @access  Private
 */
const allocateInventoryToShop = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const { productId, quantity, companyId, reason, userId } = req.body;

  if (!companyId || !productId || !quantity) {
    return res.status(400).json({
      success: false,
      message: 'companyId, productId, and quantity are required'
    });
  }

  validateMongoId(productId);

  if (quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Quantity must be greater than 0'
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findOne({
      _id: productId,
      companyId
    }).session(session);

    if (!product) {
      throw new Error('Product not found');
    }

    // Check if shop is linked to product
    const shopAvail = product.shopAvailability.find(sa => sa.shopId === shopId);
    if (!shopAvail) {
      throw new Error('Shop not linked to this product. Please link the shop first.');
    }

    // Find or create warehouse entry for shop
    let shopWarehouse = product.inventory.perWarehouse.find(
      wh => wh.warehouseId.toString() === shopId
    );

    const previousStock = shopWarehouse?.quantity || 0;

    if (!shopWarehouse) {
      // Get warehouse ID for the shop
      const warehouse = await Warehouse.findOne({
        companyId,
        name: { $regex: `Shop:` }
      }).session(session);

      if (!warehouse) {
        throw new Error('Warehouse not found for shop. Please ensure shop is properly registered.');
      }

      product.inventory.perWarehouse.push({
        warehouseId: warehouse._id,
        quantity: 0,
        lowStockThreshold: product.inventory.lowStockThreshold
      });
      shopWarehouse = product.inventory.perWarehouse[product.inventory.perWarehouse.length - 1];
    }

    // Update quantity
    shopWarehouse.quantity += quantity;
    const newStock = shopWarehouse.quantity;

    // Save product
    await product.save({ session });

    // Create stock change record
    const stockChange = new StockChange({
      companyId,
      productId: product._id,
      warehouseId: shopWarehouse.warehouseId,
      changeType: 'transfer',
      quantity,
      previousStock,
      newStock,
      reason: reason || `Allocated to shop ${shopId}`,
      changedBy: userId || 'system'
    });

    await stockChange.save({ session });

    await session.commitTransaction();

    logger.info(`✅ Allocated ${quantity} units of product ${productId} to shop ${shopId}`);

    res.json({
      success: true,
      message: 'Inventory allocated successfully',
      data: {
        productId: product._id,
        shopId,
        previousStock,
        newStock,
        quantityAllocated: quantity
      }
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`❌ Error allocating inventory: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Get shop inventory summary
 * @route   GET /api/v1/inventory/shops/:shopId/summary
 * @access  Private
 */
const getShopInventorySummary = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'companyId is required'
    });
  }

  // Aggregate shop inventory data
  const summary = await Product.aggregate([
    {
      $match: {
        companyId,
        'shopAvailability.shopId': shopId,
        'shopAvailability.enabled': true
      }
    },
    {
      $project: {
        shopWarehouse: {
          $filter: {
            input: '$inventory.perWarehouse',
            as: 'wh',
            cond: { $eq: ['$$wh.warehouseId', shopId] }
          }
        },
        lowStockThreshold: '$inventory.lowStockThreshold'
      }
    },
    {
      $project: {
        quantity: { $arrayElemAt: ['$shopWarehouse.quantity', 0] },
        lowStockThreshold: { $arrayElemAt: ['$shopWarehouse.lowStockThreshold', 0] }
      }
    },
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalQuantity: { $sum: { $ifNull: ['$quantity', 0] } },
        lowStockCount: {
          $sum: {
            $cond: [
              { $lte: ['$quantity', '$lowStockThreshold'] },
              1,
              0
            ]
          }
        },
        outOfStockCount: {
          $sum: {
            $cond: [
              { $lte: ['$quantity', 0] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  const result = summary[0] || {
    totalProducts: 0,
    totalQuantity: 0,
    lowStockCount: 0,
    outOfStockCount: 0
  };

  res.json({
    success: true,
    data: {
      shopId,
      ...result,
      lastSynced: new Date()
    }
  });
});

module.exports = {
  getShopProducts,
  getShopProductInventory,
  allocateInventoryToShop,
  getShopInventorySummary
};

