// here we are going to define all the routes for the sales service

const invoiceRoutes = require("./InvoiceRoutes");
const salesRoutes = require("./SalesRoutes");
const knownUserRoutes = require("./KnownUserRoutes");

const express = require("express");
const router = express.Router();
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');
// then define all routes here as app.use

router.use('/', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), salesRoutes);
router.use('/', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), invoiceRoutes);
router.use('/', authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), knownUserRoutes);

module.exports = router;