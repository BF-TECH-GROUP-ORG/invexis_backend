// routes/inventoryAdjustmentRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllAdjustments,
  getAdjustmentById,
  createAdjustment,
  approveAdjustment,
  rejectAdjustment
} = require('../controllers/inventoryAdjustmentController');

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

router.get('/', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getAllAdjustments);
router.get('/:id', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getAdjustmentById);
router.post('/', authenticateToken, requireRole(['super_admin','company_admin']), createAdjustment);
router.patch('/:id/approve', authenticateToken, requireRole(['super_admin','company_admin']), approveAdjustment);
router.patch('/:id/reject', authenticateToken, requireRole(['super_admin','company_admin']), rejectAdjustment);

module.exports = router;