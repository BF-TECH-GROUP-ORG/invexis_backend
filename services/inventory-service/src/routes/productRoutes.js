const express = require('express');
const { createProduct, updateProduct, deleteProduct, getOldUnboughtProducts } = require('../controllers/productController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, createProduct);
router.put('/:productId', authMiddleware, updateProduct);
router.delete('/:productId', authMiddleware, deleteProduct);
router.get('/old-unbought', authMiddleware, getOldUnboughtProducts);

module.exports = router;