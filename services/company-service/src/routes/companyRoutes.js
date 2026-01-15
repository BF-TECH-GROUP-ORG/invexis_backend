const express = require('express');
const multer = require('multer');
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
  completeOnboarding,
  getOnboardingLink,
} = require('../controllers/companyController');

const {
  getDepartmentsByCompany,
  getDepartmentById,
  updateDepartment,
  changeDepartmentStatus,
  getDepartmentStats
} = require('../controllers/departmentController');

const router = express.Router();

// Memory storage for files to be forwarded to document-service
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});


const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

// Public routes
router.get('/domain/:domain', getCompanyByDomain);

// Internal request bypass (for subscription cache population from api-gateway)
router.use((req, res, next) => {
  if (req.header('X-Internal-Request') === 'true') {
    // Skip authentication for internal requests
    return next();
  }
  // Continue to authentication for external requests
  authenticateToken(req, res, next);
});

// Protected routes (authenticated or internal)
router.post('/', createCompany);
router.get('/', getAllCompanies);
router.get('/active', getActiveCompanies);
router.get('/categories', getCompaniesByCategories);
router.get('/:id/onboarding/complete', completeOnboarding);
router.get('/:id/onboarding/link', getOnboardingLink);
router.get('/:id', getCompanyById);
router.put('/:id', updateCompany);
router.delete('/:id', deleteCompany);
router.patch('/:id/status', changeCompanyStatus);
router.patch('/:id/tier', changeCompanyTier);

// Verification routes - multer parses files in memory, then forwarded to document-service
router.post('/:id/verification-docs', upload.array('files'), uploadCompanyVerificationDocs);
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


