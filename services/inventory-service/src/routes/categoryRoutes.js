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

// Specific routes MUST come before generic /:id route
router.get('/slug/:slug', getCategoryBySlug);
router.get('/view/tree', getCategoryTree);
router.get('/path/:id', getCategoryPath);
// Generic /:id route comes last to avoid matching specific routes
router.get('/:id', getCategoryById);

router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);
router.patch('/:id/toggle-active', toggleActiveStatus);

module.exports = router;