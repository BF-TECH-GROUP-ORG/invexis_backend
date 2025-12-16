// routes/discountRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  getActiveDiscounts
} = require('../controllers/discountController');

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

router.get('/', authenticateToken, requireRole(['super_admin', 'company_admin' , 'worker']), getAllDiscounts);
router.get('/get/active', authenticateToken, requireRole(['super_admin', 'company_admin' , 'worker']), getActiveDiscounts);
router.get('/:id', authenticateToken, requireRole(['super_admin', 'company_admin' , 'worker']), getDiscountById);
router.post('/', authenticateToken, requireRole(['super_admin', 'company_admin']), createDiscount);
router.put('/:id', authenticateToken, requireRole(['super_admin', 'company_admin']), updateDiscount);
router.delete('/:id', authenticateToken, requireRole(['super_admin','company_admin']), deleteDiscount);

module.exports = router;