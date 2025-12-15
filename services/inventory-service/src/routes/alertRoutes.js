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

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

// Basic CRUD operations
router.get('/', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getAllAlerts);
router.get('/unresolved', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getUnresolvedAlerts);
router.get('/:id', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getAlertById);
router.post('/', authenticateToken, requireRole(['super_admin','company_admin']), createAlert);
router.put('/:id', authenticateToken, requireRole(['super_admin','company_admin']), updateAlert);
router.delete('/:id', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), deleteAlert);
router.patch('/:id/resolve', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), resolveAlert);

// Read/Unread operations
router.patch('/:id/read', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), markAlertAsRead);
router.patch('/:id/unread', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), markAlertAsUnread);
router.patch('/bulk/read', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), markMultipleAlertsAsRead);
router.get('/unread/alerts', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getUnreadAlerts);
router.get('/unread/count', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), getUnreadCount);

// History and statistics
router.get('/history/all', authenticateToken, requireRole(['super_admin','company_admin']), getAlertHistory);
router.get('/stats/overview', authenticateToken, requireRole(['super_admin','company_admin']), getAlertStats);

// Smart Alert Triggers
router.post('/trigger/new-arrival', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), triggerNewArrivalAlert);
router.post('/trigger/daily-summary', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), generateDailySummary);
router.post('/trigger/weekly-summary', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), generateWeeklySummary);
router.post('/trigger/monthly-summary', authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), generateMonthlySummary);
router.post('/trigger/smart-checks', authenticateToken, requireRole(['super_admin','company_admin']), runSmartChecks);

module.exports = router;