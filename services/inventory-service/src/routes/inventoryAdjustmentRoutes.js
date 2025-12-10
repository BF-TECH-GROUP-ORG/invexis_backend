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

router.get('/', getAllAdjustments);
router.get('/:id', getAdjustmentById);
router.post('/', createAdjustment);
router.patch('/:id/approve', approveAdjustment);
router.patch('/:id/reject', rejectAdjustment);

module.exports = router;