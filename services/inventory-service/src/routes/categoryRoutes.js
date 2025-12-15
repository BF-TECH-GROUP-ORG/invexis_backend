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

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

router.get('/', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getAllCategories);
// Route to fetch level-2 categories only
router.get('/level/2', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getLevel2Categories);
// Route to fetch level-3 categories only
router.get('/level/3', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getLevel3Categories);
// Route to fetch level-3 categories scoped to a company
router.get('/company/:companyId/level3', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getLevel3CategoriesByCompanyPaginated);
// Route to fetch Level 3 category with parent Level 2 hierarchy
router.get('/level3/:categoryId/with-parent', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getLevel3CategoryWithParent);

// Route to fetch multiple categories by ids (POST body: { ids: [...] })
router.post('/by-ids', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getCategoriesByIds);

// Specific routes MUST come before generic /:id route
router.get('/slug/:slug', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getCategoryBySlug);
router.get('/view/tree', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getCategoryTree);
router.get('/path/:id', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getCategoryPath);
// Generic /:id route comes last to avoid matching specific routes
router.get('/:id', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getCategoryById);

router.post('/', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), createCategory);
// Admin seed endpoint - optional protection via CATEGORY_SEED_SECRET header 'x-category-seed-secret'
router.post('/admin/seed/categories', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), seedCategories);
// Dedicated route to create level-3 categories for a company (requires companyId)
router.post('/company/:companyId/level3', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), createLevel3Category);
router.put('/:id', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), updateCategory);
router.delete('/:id', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), deleteCategory);
router.patch('/:id/toggle-active', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), toggleActiveStatus);

module.exports = router;