const express = require("express");
const router = express.Router();
const AuditController = require("../controllers/AuditController");
const AnalyticsController = require("../controllers/AnalyticsController");
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

router.use(authenticateToken); // Protect all audit routes

// Core audit log routes
router.get("/logs", requireRole(['super_admin', 'company_admin']), AuditController.getLogs);
router.get("/logs/:id", requireRole(['super_admin', 'company_admin']), AuditController.getLogDetails);

// Export
router.get("/export", requireRole(['super_admin', 'company_admin']), AuditController.exportLogs);

// Analytics endpoints
router.get("/analytics/shops", requireRole(['super_admin', 'company_admin']), AnalyticsController.getActivityByShop);
router.get("/analytics/workers", requireRole(['super_admin', 'company_admin']), AnalyticsController.getActivityByWorker);
router.get("/analytics/events", requireRole(['super_admin', 'company_admin']), AnalyticsController.getEventDistribution);
router.get("/analytics/trends", requireRole(['super_admin', 'company_admin']), AnalyticsController.getSeverityTrends);
router.get("/analytics/stats", requireRole(['super_admin', 'company_admin']), AnalyticsController.getStats);

// Change tracking
router.get("/changes/:entityId", requireRole(['super_admin', 'company_admin']), AnalyticsController.getChangeHistory);
router.get("/timeline", requireRole(['super_admin', 'company_admin']), AnalyticsController.getUserActivityTimeline);

module.exports = router;
