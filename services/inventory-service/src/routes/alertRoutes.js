// routes/alertRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  resolveAlert,
  getUnresolvedAlerts,
  generateDailySummary,
  generateWeeklySummary,
  generateMonthlySummary,
  runSmartChecks,
  // New endpoints
  markAlertAsRead,
  markAlertAsUnread,
  markMultipleAlertsAsRead,
  getUnreadAlerts,
  getUnreadCount,
  getAlertHistory,
  getAlertStats,
  triggerNewArrivalAlert
} = require('../controllers/alertController');

// Basic CRUD operations
router.get('/', getAllAlerts);
router.get('/unresolved', getUnresolvedAlerts);
router.get('/:id', getAlertById);
router.post('/', createAlert);
router.put('/:id', updateAlert);
router.delete('/:id', deleteAlert);
router.patch('/:id/resolve', resolveAlert);

// Read/Unread operations
router.patch('/:id/read', markAlertAsRead);
router.patch('/:id/unread', markAlertAsUnread);
router.patch('/bulk/read', markMultipleAlertsAsRead);
router.get('/unread/alerts', getUnreadAlerts);
router.get('/unread/count', getUnreadCount);

// History and statistics
router.get('/history/all', getAlertHistory);
router.get('/stats/overview', getAlertStats);

// Smart Alert Triggers
router.post('/trigger/new-arrival', triggerNewArrivalAlert);
router.post('/trigger/daily-summary', generateDailySummary);
router.post('/trigger/weekly-summary', generateWeeklySummary);
router.post('/trigger/monthly-summary', generateMonthlySummary);
router.post('/trigger/smart-checks', runSmartChecks);

module.exports = router;