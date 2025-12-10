const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/InvoiceController");
// const {
//   checkSubscriptionActive,
//   checkFeatureAccess,
//   checkRateLimits,
// } = require("/app/shared/middlewares/subscription");

/**
 * Invoice Management Routes
 * Base path: /invoices
 */

// Apply rate limiting
// router.use(
//   checkRateLimits({
//     limits: { basic: 50, mid: 200, pro: 1000 },
//     windowMs: 60000,
//     companyIdSource: "query",
//     companyIdField: "company_id",
//   })
// );

// Apply subscription validation for all invoice operations
// router.use(
//   checkSubscriptionActive({
//     companyIdSource: "query",
//     companyIdField: "company_id",
//   })
// );

// Invoicing is a Pro-only feature
// router.use(
//   checkFeatureAccess("sales", "invoicing", {
//     companyIdSource: "query",
//     companyIdField: "company_id",
//   })
// );

// Get invoice by ID
router.get("/:invoiceId", invoiceController.getInvoice);

// Get all invoices for a company
router.get("/company/:companyId", invoiceController.getInvoicesByCompany);

// Generate PDF for invoice
router.post("/:invoiceId/generate-pdf", invoiceController.generateInvoicePdf);

// View PDF in browser (inline)
router.get("/:invoiceId/view-pdf", invoiceController.viewInvoicePdf);

// Download PDF
router.get("/pdf/:fileName", invoiceController.downloadInvoicePdf);

// Delete PDF
router.delete("/:invoiceId/pdf", invoiceController.deleteInvoicePdf);

module.exports = router;

