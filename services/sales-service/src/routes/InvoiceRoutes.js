const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/InvoiceController");

/**
 * Invoice Management Routes
 * Base path: /invoices
 */

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

