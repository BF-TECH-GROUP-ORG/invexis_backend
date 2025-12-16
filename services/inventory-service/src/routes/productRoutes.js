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
  bulkCreateProducts,
  bulkUpdateProducts,
  bulkDeleteProducts,
  deleteAllProducts, // Add import
  checkProductDuplicate,
  scanProduct,
  lookupByBarcode
} = require('../controllers/productController');

const { handleUploads } = require('../utils/uploadUtil');


const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');


router.get('/', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getAllProducts);

// Bulk operations - MUST come before parameterized routes
router.post('/bulk', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), bulkCreateProducts);
router.put('/bulk', authenticateToken, requireRole(['super_admin', 'company_admin']), bulkUpdateProducts);
router.delete('/bulk', authenticateToken, requireRole(['super_admin', 'company_admin']), bulkDeleteProducts);
router.delete('/delete-all', authenticateToken, requireRole(['super_admin']), deleteAllProducts); // New route for deleting all products

// QR Code & Barcode Scanning
router.post('/scan', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), scanProduct);
router.get('/lookup/:barcode', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), lookupByBarcode);

// Smart Product Creation
router.post('/smart-create', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), smartCreateProduct);
router.get('/check-duplicate', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), checkProductDuplicate);

// Specific static routes before parameterized ones
router.get('/low/stock', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getLowStockProducts);
router.get('/get/scheduled', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getScheduledProducts);
router.get('/get/featured', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getFeaturedProducts);
router.get('/search/product', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), searchProducts);
router.get('/old/unbought', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getOldUnboughtProducts);

// Parameterized routes - MUST come after static routes
router.get('/:id', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getProductById);
router.get('/slug/:slug', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getProductBySlug);
router.get('/category/:categoryId', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getProductsByCategory);
router.post('/', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), handleUploads, createProduct);
// For updates, copy :id to productId param so uploads go to the same folder
router.put('/:id', authenticateToken, requireRole(['super_admin', 'company_admin']), (req, res, next) => { req.params.productId = req.params.id; next(); }, handleUploads, updateProduct);
router.delete('/:id', authenticateToken, requireRole(['super_admin', 'company_admin']), deleteProduct);
router.patch('/:id/inventory', authenticateToken, requireRole(['super_admin', 'company_admin']), updateInventory);

module.exports = router;