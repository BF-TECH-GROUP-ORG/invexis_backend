// routes/productRoutes.js (Updated to include getOldUnboughtProducts)
const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProductById,
  getProductBySlug,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  updateInventory,
  getLowStockProducts,
  getScheduledProducts,
  getFeaturedProducts,
  searchProducts,
  getOldUnboughtProducts,
  smartCreateProduct,
  checkProductDuplicate,
  scanProduct,
  lookupByBarcode
} = require('../controllers/productController');
const { protect } = require('../middleware/auth');
const { handleUploads } = require('../utils/uploadUtil');
const { preGenerateProductId } = require('../middleware/preGenerateId');

router.get('/', getAllProducts);
router.get('/:id', getProductById);
router.get('/slug/:slug', getProductBySlug);
router.get('/category/:categoryId', getProductsByCategory);
router.post('/', handleUploads, createProduct);
// For updates, copy :id to productId param so uploads go to the same folder
router.put('/:id', (req, res, next) => { req.params.productId = req.params.id; next(); }, handleUploads, updateProduct);
router.delete('/:id', deleteProduct);
router.patch('/:id/inventory', updateInventory);
router.get('/low/stock', getLowStockProducts);
router.get('/get/scheduled', getScheduledProducts);
router.get('/get/featured', getFeaturedProducts);
router.get('/search/product', searchProducts);
router.get('/old/unbought', getOldUnboughtProducts);

// QR Code & Barcode Scanning
router.post('/scan', scanProduct);
router.get('/lookup/:barcode', lookupByBarcode);

// Smart Product Creation
router.post('/smart-create', protect, smartCreateProduct);
router.get('/check-duplicate', protect, checkProductDuplicate);

module.exports = router;