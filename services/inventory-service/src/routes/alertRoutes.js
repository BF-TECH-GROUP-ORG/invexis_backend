// routes/alertRoutes.js (Unchanged)
const express = require('express');
const router = express.Router();
const {
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  resolveAlert,
  getUnresolvedAlerts
} = require('../controllers/alertController');

router.get('/', getAllAlerts);
router.get('/unresolved', getUnresolvedAlerts);
router.get('/:id', getAlertById);
router.post('/', createAlert);
router.put('/:id', updateAlert);
router.delete('/:id', deleteAlert);
router.patch('/:id/resolve', resolveAlert);

module.exports = router;