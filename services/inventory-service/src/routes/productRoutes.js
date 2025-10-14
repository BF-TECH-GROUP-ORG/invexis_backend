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
  searchProducts
} = require('../controllers/productController');
const authMiddleware = require('../middleware/auth');
const { handleUploads } = require('../utils/uploadUtil');

router.get('/', getAllProducts);
router.get('/:id', getProductById);
router.get('/slug/:slug', authMiddleware, getProductBySlug);
router.get('/category/:categoryId', getProductsByCategory);
router.post('/', authMiddleware, handleUploads, createProduct);
router.put('/:id', authMiddleware,handleUploads, updateProduct);
router.delete('/:id', authMiddleware, deleteProduct);
router.patch('/:id/inventory', authMiddleware, updateInventory);
router.get('/low-stock', getLowStockProducts);
router.get('/scheduled', getScheduledProducts);
router.get('/featured', getFeaturedProducts);
router.get('/search', searchProducts);

module.exports = router;