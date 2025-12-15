// routes/categoryRoutes.js (Unchanged)
const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryTree,
  getLevel2Categories,
  getLevel3Categories,
  getLevel3CategoriesByCompany,
  getLevel3CategoriesByCompanyPaginated,
  getCategoriesByIds,
  getCategoryPath,
  getLevel3CategoryWithParent,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleActiveStatus,
  seedCategories,
  createLevel3Category
} = require('../controllers/categoryController');

router.get('/', getAllCategories);
// Route to fetch level-2 categories only
router.get('/level/2', getLevel2Categories);
// Route to fetch level-3 categories only
router.get('/level/3', getLevel3Categories);
// Route to fetch level-3 categories scoped to a company
router.get('/company/:companyId/level3', getLevel3CategoriesByCompanyPaginated);
// Route to fetch Level 3 category with parent Level 2 hierarchy
router.get('/level3/:categoryId/with-parent', getLevel3CategoryWithParent);

// Route to fetch multiple categories by ids (POST body: { ids: [...] })
router.post('/by-ids', getCategoriesByIds);

// Specific routes MUST come before generic /:id route
router.get('/slug/:slug', getCategoryBySlug);
router.get('/view/tree', getCategoryTree);
router.get('/path/:id', getCategoryPath);
// Generic /:id route comes last to avoid matching specific routes
router.get('/:id', getCategoryById);

router.post('/', createCategory);
// Admin seed endpoint - optional protection via CATEGORY_SEED_SECRET header 'x-category-seed-secret'
router.post('/admin/seed/categories', seedCategories);
// Dedicated route to create level-3 categories for a company (requires companyId)
router.post('/company/:companyId/level3', createLevel3Category);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);
router.patch('/:id/toggle-active', toggleActiveStatus);

module.exports = router;