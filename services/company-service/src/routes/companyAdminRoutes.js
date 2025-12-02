const express = require('express');
const {
    assignCompanyAdmin,
    getCompanyAdmin,
    getCompanyUsers,
    removeCompanyAdmin,
    getAdministeredCompanies,
} = require('../controllers/companyAdminController');

const router = express.Router();

// Assign or update company admin
router.post('/company/:companyId', assignCompanyAdmin);

// Get current company admin
router.get('/company/:companyId', getCompanyAdmin);

// Get all users in a company (from Auth Service)
router.get('/company/:companyId/users', getCompanyUsers);

// Remove company admin
router.delete('/company/:companyId', removeCompanyAdmin);

// Get companies administered by a user
router.get('/user/:userId', getAdministeredCompanies);

module.exports = router;
