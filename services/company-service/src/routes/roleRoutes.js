const express = require('express');
const {
  createRole,
  getRolesByCompany,
  getRoleById,
  getRoleByName,
  updateRole,
  deleteRole,
  addPermission,
  removePermission,
} = require('../controllers/roleController');

const router = express.Router();

// Role CRUD operations
router.post('/', createRole);
router.get('/company/:companyId', getRolesByCompany);
router.get('/company/:companyId/name/:name', getRoleByName);
router.get('/:id', getRoleById);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);

// Permission management
router.post('/:id/permissions', addPermission);
router.delete('/:id/permissions', removePermission);

module.exports = router;

