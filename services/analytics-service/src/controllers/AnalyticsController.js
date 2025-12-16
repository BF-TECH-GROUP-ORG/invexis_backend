const { AnalyticsEvent, SalesMetric, SalesItemMetric, Company, Shop, User, InventoryMetric } = require("../models");
const sequelize = require("../config/database");
const { Op } = require("sequelize");
const { startOfDay, endOfDay, subDays, startOfMonth } = require("date-fns");

/**
 * Analytics Controller
 * Serves platform-wide analytics and insights.
 */

// 1. Dashboard Overview
exports.getDashboardOverview = async (req, res) => {
    try {
        const [
            totalCompanies,
            totalShops,
            totalUsers,
            totalRevenueObj
        ] = await Promise.all([
            Company.count(),
            Shop.count(),
            User.count(),
            SalesMetric.sum('amount') // Total platform revenue
        ]);

        const totalRevenue = totalRevenueObj || 0;

        res.json({
            success: true,
            data: {
                totalCompanies,
                totalShops,
                totalUsers,
                totalRevenue
            }
        });
    } catch (error) {
        console.error("Dashboard overview error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Sales Analytics by Tier
exports.getSalesByTier = async (req, res) => {
    try {
        // Using SalesItemMetric which has denormalized 'tier'
        const tiers = await SalesItemMetric.findAll({
            attributes: [
                'tier',
                [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount']
            ],
            group: ['tier'],
            raw: true,
            order: [[sequelize.literal('revenue'), 'DESC']]
        });

        res.json({
            success: true,
            data: tiers
        });
    } catch (error) {
        console.error("Sales by tier error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Trending Insights (Companies, Tiers, Categories)
exports.getTrendingInsights = async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = subDays(new Date(), parseInt(days));

        const whereTime = {
            time: {
                [Op.gte]: startDate
            }
        };

        const [topCompanies, topCategories, topTiers] = await Promise.all([
            // Top Companies
            SalesItemMetric.findAll({
                where: whereTime,
                attributes: [
                    'companyId',
                    [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue']
                ],
                group: ['companyId'],
                limit: 5,
                order: [[sequelize.literal('revenue'), 'DESC']],
                raw: true
            }),
            // Top Categories
            SalesItemMetric.findAll({
                where: whereTime,
                attributes: [
                    'category',
                    [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue']
                ],
                group: ['category'],
                limit: 5,
                order: [[sequelize.literal('revenue'), 'DESC']],
                raw: true
            }),
            // Top Tiers (Recent trend)
            SalesItemMetric.findAll({
                where: whereTime,
                attributes: [
                    'tier',
                    [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue']
                ],
                group: ['tier'],
                limit: 5,
                order: [[sequelize.literal('revenue'), 'DESC']],
                raw: true
            })
        ]);

        // Enrich company names
        const enrichedCompanies = await Promise.all(topCompanies.map(async (c) => {
            const comp = await Company.findByPk(c.companyId, { attributes: ['name'] });
            return {
                companyId: c.companyId,
                name: comp ? comp.name : 'Unknown',
                revenue: c.revenue
            };
        }));

        res.json({
            success: true,
            data: {
                topCompanies: enrichedCompanies,
                topCategories,
                topTiers
            }
        });
    } catch (error) {
        console.error("Trending insights error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Top 20 Best-Selling Companies
exports.getTopCompanies = async (req, res) => {
    try {
        const topCompanies = await SalesMetric.findAll({
            attributes: [
                'companyId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalSales']
            ],
            group: ['companyId'],
            limit: 20, // Top 20
            order: [[sequelize.literal('"totalSales"'), 'DESC']],
            raw: true
        });

        // Enrich with Company Metadata
        const enriched = await Promise.all(topCompanies.map(async (stat) => {
            const company = await Company.findByPk(stat.companyId);
            return {
                companyId: stat.companyId,
                name: company ? company.name : "Unknown",
                tier: company ? company.tier : "N/A",
                status: company ? company.status : "N/A",
                totalSales: stat.totalSales
            };
        }));

        res.json({
            success: true,
            data: enriched
        });
    } catch (error) {
        console.error("Top companies error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Active / Inactive Companies
exports.getCompanyStatusStats = async (req, res) => {
    try {
        const stats = await Company.findAll({
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['status'],
            raw: true
        });

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error("Company status stats error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 6. Recent Registered Companies
exports.getRecentCompanies = async (req, res) => {
    try {
        const recent = await Company.findAll({
            limit: 10,
            order: [['registrationDate', 'DESC']]
        });

        res.json({
            success: true,
            data: recent
        });
    } catch (error) {
        console.error("Recent companies error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 7. Tier Distribution
exports.getTierDistribution = async (req, res) => {
    try {
        const stats = await Company.findAll({
            attributes: [
                'tier',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['tier'],
            raw: true
        });

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error("Tier distribution error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Legacy/Compatibility methods ---

exports.getEventTypes = async (req, res) => {
    // Keep existing implementation if needed or deprecate
    res.json({ success: true, data: [] });
};

exports.getEventStats = async (req, res) => {
    res.json({ success: true, data: [] });
};

exports.getDashboardSummary = async (req, res) => {
    // Forward to getDashboardOverview
    return exports.getDashboardOverview(req, res);
};

exports.getPlatformHealth = async (req, res) => {
    // Basic implementation
    return exports.getDashboardOverview(req, res);
};
