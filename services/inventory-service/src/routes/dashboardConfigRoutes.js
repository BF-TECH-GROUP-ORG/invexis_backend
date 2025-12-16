// routes/dashboardConfigRoutes.js
// Dashboard configuration and customization endpoints

const express = require('express');
const router = express.Router();
const {
    getDashboardConfig,
    updateDashboardConfig,
    getAvailableWidgets,
    saveFavoriteReport,
    getFavoriteReports,
    deleteFavoriteReport
} = require('../controllers/dashboardConfigController');
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

/**
 * GET /api/v1/dashboard/:companyId
 * Get dashboard configuration for a company
 */
router.get('/:companyId', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getDashboardConfig);

/**
 * PUT /api/v1/dashboard/:companyId
 * Update dashboard configuration
 * Body: { widgets, layout, theme }
 */
router.put('/:companyId', authenticateToken, requireRole(['super_admin', 'company_admin']), updateDashboardConfig);

/**
 * GET /api/v1/dashboard/widgets/available
 * Get all available dashboard widgets
 */
router.get('/widgets/available', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getAvailableWidgets);

/**
 * POST /api/v1/dashboard/favorites
 * Save a custom report to favorites
 * Body: { companyId, name, reportConfig }
 */
router.post('/favorites', authenticateToken, requireRole(['super_admin', 'company_admin']), saveFavoriteReport);

/**
 * GET /api/v1/dashboard/favorites/:companyId
 * Get all saved favorite reports
 */
router.get('/favorites/:companyId', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), getFavoriteReports);

/**
 * DELETE /api/v1/dashboard/favorites/:companyId/:favoriteId
 * Delete a favorite report
 */
router.delete('/favorites/:companyId/:favoriteId', authenticateToken, requireRole(['super_admin', 'company_admin']), deleteFavoriteReport);

module.exports = router;
