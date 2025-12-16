const express = require("express");
const router = express.Router();
const AuditController = require("../controllers/AuditController");
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

router.use(authenticateToken); // Protect all audit routes

// Allow super_admin, company_admin to view logs
// (Controller handles tenancy checks for company_admin)
router.get("/logs", requireRole(['super_admin', 'company_admin']), AuditController.getLogs);

router.get("/logs/:id", requireRole(['super_admin', 'company_admin']), AuditController.getLogDetails);

module.exports = router;
