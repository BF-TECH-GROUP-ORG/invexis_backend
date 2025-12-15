const express = require('express');
const {
  assignUserToCompany,
  getUsersByCompany,
  getCompaniesByUser,
  getUserCompanyRelation,
  updateUserRole,
  suspendUser,
  removeUserFromCompany,
} = require('../controllers/companyUserController');

const router = express.Router();

// User-Company relationship management
router.post('/', assignUserToCompany);
router.get('/company/:companyId', getUsersByCompany);
router.get('/user/:userId', getCompaniesByUser);
router.get('/company/:companyId/user/:userId', getUserCompanyRelation);
router.patch('/company/:companyId/user/:userId/role', updateUserRole);
router.patch('/company/:companyId/user/:userId/suspend', suspendUser);
router.delete('/company/:companyId/user/:userId', removeUserFromCompany);

module.exports = router;

