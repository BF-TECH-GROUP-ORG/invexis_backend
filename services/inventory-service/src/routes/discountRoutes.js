// routes/discountRoutes.js (Unchanged)
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

router.get('/', getAllDiscounts);
router.get('/get/active', getActiveDiscounts);
router.get('/:id', getDiscountById);
router.post('/', createDiscount);
router.put('/:id', updateDiscount);
router.delete('/:id', deleteDiscount);

module.exports = router;