const express = require('express');
const router = express.Router();
const {
  getShopProducts,
  getShopProductInventory,
  allocateInventoryToShop,
  getShopInventorySummary
} = require('../controllers/shopInventoryController');

// Shop inventory routes
router.get('/shops/:shopId/products', getShopProducts);
router.get('/shops/:shopId/products/:productId', getShopProductInventory);
router.post('/shops/:shopId/allocate', allocateInventoryToShop);
router.get('/shops/:shopId/summary', getShopInventorySummary);

module.exports = router;

