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
const { protect } = require('../middleware/auth');

/**
 * GET /api/v1/dashboard/:companyId
 * Get dashboard configuration for a company
 */
router.get('/:companyId', protect, getDashboardConfig);

/**
 * PUT /api/v1/dashboard/:companyId
 * Update dashboard configuration
 * Body: { widgets, layout, theme }
 */
router.put('/:companyId', protect, updateDashboardConfig);

/**
 * GET /api/v1/dashboard/widgets/available
 * Get all available dashboard widgets
 */
router.get('/widgets/available', protect, getAvailableWidgets);

/**
 * POST /api/v1/dashboard/favorites
 * Save a custom report to favorites
 * Body: { companyId, name, reportConfig }
 */
router.post('/favorites', protect, saveFavoriteReport);

/**
 * GET /api/v1/dashboard/favorites/:companyId
 * Get all saved favorite reports
 */
router.get('/favorites/:companyId', protect, getFavoriteReports);

/**
 * DELETE /api/v1/dashboard/favorites/:companyId/:favoriteId
 * Delete a favorite report
 */
router.delete('/favorites/:companyId/:favoriteId', protect, deleteFavoriteReport);

module.exports = router;
