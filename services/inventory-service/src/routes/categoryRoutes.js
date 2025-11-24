// routes/categoryRoutes.js (Unchanged)
const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryTree,
  getLevel3CategoriesByCompany,
  getCategoryPath,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleActiveStatus
} = require('../controllers/categoryController');

router.get('/', getAllCategories);
// Route to fetch level-3 categories scoped to a company
router.get('/company/:companyId/level3', getLevel3CategoriesByCompany);

router.get('/:id', getCategoryById);
router.get('/slug/:slug', getCategoryBySlug);
router.get('/view/tree', getCategoryTree);
router.get('/path/:id', getCategoryPath);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);
router.patch('/:id/toggle-active', toggleActiveStatus);

module.exports = router;