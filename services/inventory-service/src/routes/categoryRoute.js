const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryTree,
  getCategoryPath,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleActiveStatus
} = require('../controllers/categoryController');
const authMiddleware = require('../middleware/auth');

router.get('/', getAllCategories);
router.get('/:id', getCategoryById);
router.get('/slug/:slug', getCategoryBySlug);
router.get('/tree', getCategoryTree);
router.get('/path/:id', getCategoryPath);
router.post('/', authMiddleware, createCategory);
router.put('/:id', authMiddleware, updateCategory);
router.delete('/:id', authMiddleware, deleteCategory);
router.patch('/:id/toggle-active', authMiddleware, toggleActiveStatus);

module.exports = router;