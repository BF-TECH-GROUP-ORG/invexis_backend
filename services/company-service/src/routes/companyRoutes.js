const express = require('express');
const upload = require('../middleware/upload');
const {
  createCompany,
  getAllCompanies,
  getCompanyById,
  getCompanyByDomain,
  updateCompany,
  deleteCompany,
  changeCompanyStatus,
  changeCompanyTier,
  getActiveCompanies,
  reactivateCompany,
  getCompaniesByCategories,
  addCompanyCategories,
  removeCompanyCategories,
  setCompanyCategories,
  uploadCompanyVerificationDocs,
  reviewCompanyVerification,
} = require('../controllers/companyController');

const {
  getDepartmentsByCompany,
  getDepartmentById,
  updateDepartment,
  changeDepartmentStatus,
  getDepartmentStats
} = require('../controllers/departmentController');

const router = express.Router();

// Public routes
router.get('/domain/:domain', getCompanyByDomain);

// Protected routes (add auth middleware as needed)
router.post('/', createCompany);
router.get('/', getAllCompanies);
router.get('/active', getActiveCompanies);
router.get('/categories', getCompaniesByCategories);
router.get('/:id', getCompanyById);
router.put('/:id', updateCompany);
router.delete('/:id', deleteCompany);
router.patch('/:id/status', changeCompanyStatus);
router.patch('/:id/tier', changeCompanyTier);

// Verification routes - use multer for file uploads
router.post('/:id/verification-docs', upload.array('documents', 10), uploadCompanyVerificationDocs);
router.patch('/:id/verification', reviewCompanyVerification);

router.patch('/:id/reactivate', reactivateCompany);

// Category management routes
router.post('/:id/categories', addCompanyCategories);
router.put('/:id/categories', setCompanyCategories);
router.delete('/:id/categories', removeCompanyCategories);

/**
 * Department management routes (nested under company)
 * Also available at /company/departments
 */

// Get all departments for company
// GET /companies/:companyId/departments
router.get('/:companyId/departments', (req, res, next) => {
  req.query.companyId = req.params.companyId;
  getDepartmentsByCompany(req, res, next);
});

// Get single department
// GET /companies/:companyId/departments/:departmentId
router.get('/:companyId/departments/:departmentId', (req, res, next) => {
  req.query.companyId = req.params.companyId;
  getDepartmentById(req, res, next);
});

// Get department stats
// GET /companies/:companyId/departments/:departmentId/stats
router.get('/:companyId/departments/:departmentId/stats', (req, res, next) => {
  req.query.companyId = req.params.companyId;
  getDepartmentStats(req, res, next);
});

// Update department
// PUT /companies/:companyId/departments/:departmentId
router.put('/:companyId/departments/:departmentId', (req, res, next) => {
  req.body.companyId = req.params.companyId;
  updateDepartment(req, res, next);
});

// Change department status
// PATCH /companies/:companyId/departments/:departmentId/status
router.patch('/:companyId/departments/:departmentId/status', (req, res, next) => {
  req.body.companyId = req.params.companyId;
  changeDepartmentStatus(req, res, next);
});

module.exports = router;


