const express = require('express');
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
} = require('../controllers/companyController');

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
router.patch('/:id/reactivate', reactivateCompany);

// Category management routes
router.post('/:id/categories', addCompanyCategories);
router.put('/:id/categories', setCompanyCategories);
router.delete('/:id/categories', removeCompanyCategories);

module.exports = router;

