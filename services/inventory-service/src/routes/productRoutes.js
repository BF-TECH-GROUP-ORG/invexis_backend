const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const productController = require('../controllers/ProductController');

router.post('/', authMiddleware, productController.addProduct);
router.put('/:asin', authMiddleware, productController.updateProduct);
router.delete('/:asin', authMiddleware, productController.deleteProduct);
router.get('/:asin', authMiddleware, productController.getProductByAsin);
router.get('/', authMiddleware, productController.getProducts);

module.exports = router;