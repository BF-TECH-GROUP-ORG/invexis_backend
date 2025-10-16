const express = require('express');
const { createCategory, getCategoryTree, getCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, createCategory);
router.get('/tree', authMiddleware, getCategoryTree);
router.get('/:categoryId', authMiddleware, getCategory);
router.put('/:categoryId', authMiddleware, updateCategory);
router.delete('/:categoryId', authMiddleware, deleteCategory);

module.exports = router;