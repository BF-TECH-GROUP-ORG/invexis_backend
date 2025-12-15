// controllers/dashboardConfigController.js
// Dashboard customization and widget configuration

// Manual async wrapper instead of express-async-handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
const mongoose = require('mongoose');
const { validateMongoId } = require('../utils/validateMongoId');
const { logger } = require('../utils/logger');

// Simplified in-memory dashboard config (can be migrated to MongoDB)
const dashboardConfigs = new Map();

/**
 * @desc    Get dashboard configuration
 * @route   GET /api/v1/dashboard-config/:companyId
 * @param   companyId - Company ID
 * @access  Private
 */
const getDashboardConfig = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    // Get existing config or return default
    const config = dashboardConfigs.get(companyId) || getDefaultDashboardConfig();

    res.json({
        success: true,
        companyId,
        config
    });
});

/**
 * @desc    Update dashboard configuration
 * @route   PUT /api/v1/dashboard-config/:companyId
 * @body    { widgets: [], layout: {}, theme: {} }
 * @access  Private
 */
const updateDashboardConfig = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { widgets, layout, theme } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    const config = {
        companyId,
        widgets: widgets || getDefaultDashboardConfig().widgets,
        layout: layout || getDefaultDashboardConfig().layout,
        theme: theme || getDefaultDashboardConfig().theme,
        updatedAt: new Date()
    };

    dashboardConfigs.set(companyId, config);

    logger.info(`Dashboard config updated for company ${companyId}`);

    res.json({
        success: true,
        message: 'Dashboard configuration updated',
        config
    });
});

/**
 * @desc    Get available widgets
 * @route   GET /api/v1/dashboard-config/widgets/available
 * @access  Private
 */
const getAvailableWidgets = asyncHandler(async (req, res) => {
    const availableWidgets = [
        {
            id: 'revenue-summary',
            name: 'Revenue Summary',
            description: 'Total revenue, daily average, trends',
            icon: 'chart-bar',
            category: 'financial',
            defaultSize: { width: 2, height: 1 },
            metrics: ['totalRevenue', 'dailyRevenue', 'revenueGrowth']
        },
        {
            id: 'inventory-health',
            name: 'Inventory Health',
            description: 'Stock status, low stock items',
            icon: 'package',
            category: 'inventory',
            defaultSize: { width: 2, height: 1 },
            metrics: ['healthScore', 'lowStockCount', 'outOfStockCount']
        },
        {
            id: 'top-products',
            name: 'Top Products',
            description: 'Best sellers by revenue',
            icon: 'star',
            category: 'sales',
            defaultSize: { width: 2, height: 2 },
            metrics: ['topProducts', 'unitsSold', 'revenue']
        },
        {
            id: 'sales-trend',
            name: 'Sales Trend',
            description: 'Daily sales chart',
            icon: 'trending-up',
            category: 'sales',
            defaultSize: { width: 3, height: 2 },
            metrics: ['dailySales', 'trend', 'forecast']
        },
        {
            id: 'profit-analysis',
            name: 'Profit Analysis',
            description: 'Gross profit, margin, cost analysis',
            icon: 'dollar-sign',
            category: 'financial',
            defaultSize: { width: 2, height: 1 },
            metrics: ['grossProfit', 'profitMargin', 'costOfGoods']
        },
        {
            id: 'category-breakdown',
            name: 'Category Breakdown',
            description: 'Sales by product category',
            icon: 'layers',
            category: 'sales',
            defaultSize: { width: 2, height: 2 },
            metrics: ['categoryRevenue', 'categoryUnits']
        },
        {
            id: 'alerts-overview',
            name: 'Alerts Overview',
            description: 'Active alerts and warnings',
            icon: 'bell',
            category: 'operations',
            defaultSize: { width: 1, height: 1 },
            metrics: ['activeAlerts', 'criticalAlerts']
        },
        {
            id: 'forecast-preview',
            name: 'Revenue Forecast',
            description: 'Next 7 days prediction',
            icon: 'crystal-ball',
            category: 'analytics',
            defaultSize: { width: 2, height: 1 },
            metrics: ['forecastedRevenue', 'confidence']
        },
        {
            id: 'inventory-value',
            name: 'Inventory Value',
            description: 'Total stock value and metrics',
            icon: 'box',
            category: 'inventory',
            defaultSize: { width: 1, height: 1 },
            metrics: ['totalValue', 'avgStockPerProduct']
        },
        {
            id: 'kpi-summary',
            name: 'KPI Summary',
            description: 'All critical KPIs at a glance',
            icon: 'gauge',
            category: 'dashboard',
            defaultSize: { width: 4, height: 2 },
            metrics: ['allKPIs']
        }
    ];

    res.json({
        success: true,
        count: availableWidgets.length,
        widgets: availableWidgets
    });
});

/**
 * @desc    Save favorite report
 * @route   POST /api/v1/dashboard-config/favorites
 * @body    { companyId, name, reportConfig }
 * @access  Private
 */
const saveFavoriteReport = asyncHandler(async (req, res) => {
    const { companyId, name, reportConfig } = req.body;

    if (!companyId || !name || !reportConfig) {
        return res.status(400).json({
            success: false,
            message: 'companyId, name, and reportConfig are required'
        });
    }

    const favorites = dashboardConfigs.get(`favorites-${companyId}`) || [];

    const favorite = {
        id: mongoose.Types.ObjectId().toString(),
        name,
        reportConfig,
        createdAt: new Date(),
        createdBy: req.user?.id || 'system'
    };

    favorites.push(favorite);
    dashboardConfigs.set(`favorites-${companyId}`, favorites);

    res.status(201).json({
        success: true,
        message: 'Report saved to favorites',
        favorite
    });
});

/**
 * @desc    Get favorite reports
 * @route   GET /api/v1/dashboard-config/favorites/:companyId
 * @param   companyId - Company ID
 * @access  Private
 */
const getFavoriteReports = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    const favorites = dashboardConfigs.get(`favorites-${companyId}`) || [];

    res.json({
        success: true,
        companyId,
        count: favorites.length,
        favorites
    });
});

/**
 * @desc    Delete favorite report
 * @route   DELETE /api/v1/dashboard-config/favorites/:companyId/:favoriteId
 * @param   companyId - Company ID
 * @param   favoriteId - Favorite report ID
 * @access  Private
 */
const deleteFavoriteReport = asyncHandler(async (req, res) => {
    const { companyId, favoriteId } = req.params;

    if (!companyId || !favoriteId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and favoriteId are required'
        });
    }

    const favorites = dashboardConfigs.get(`favorites-${companyId}`) || [];
    const filtered = favorites.filter(f => f.id !== favoriteId);

    dashboardConfigs.set(`favorites-${companyId}`, filtered);

    res.json({
        success: true,
        message: 'Favorite report deleted'
    });
});

// ==================== HELPER FUNCTIONS ====================

function getDefaultDashboardConfig() {
    return {
        widgets: [
            {
                id: 'kpi-summary',
                enabled: true,
                position: 0,
                size: { width: 4, height: 2 }
            },
            {
                id: 'sales-trend',
                enabled: true,
                position: 1,
                size: { width: 3, height: 2 }
            },
            {
                id: 'revenue-summary',
                enabled: true,
                position: 2,
                size: { width: 2, height: 1 }
            },
            {
                id: 'profit-analysis',
                enabled: true,
                position: 3,
                size: { width: 2, height: 1 }
            },
            {
                id: 'inventory-health',
                enabled: true,
                position: 4,
                size: { width: 2, height: 1 }
            },
            {
                id: 'top-products',
                enabled: true,
                position: 5,
                size: { width: 2, height: 2 }
            },
            {
                id: 'category-breakdown',
                enabled: true,
                position: 6,
                size: { width: 2, height: 2 }
            },
            {
                id: 'forecast-preview',
                enabled: true,
                position: 7,
                size: { width: 2, height: 1 }
            },
            {
                id: 'alerts-overview',
                enabled: true,
                position: 8,
                size: { width: 1, height: 1 }
            }
        ],
        layout: {
            type: 'grid',
            columns: 4,
            gap: 16,
            responsive: true
        },
        theme: {
            colorScheme: 'light',
            accentColor: '#0066cc',
            primaryColor: '#1a1a1a',
            backgroundColor: '#ffffff'
        }
    };
}

module.exports = {
    getDashboardConfig,
    updateDashboardConfig,
    getAvailableWidgets,
    saveFavoriteReport,
    getFavoriteReports,
    deleteFavoriteReport
};
