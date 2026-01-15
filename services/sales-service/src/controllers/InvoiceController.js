const Invoice = require("../models/Invoice.model");
const Sale = require("../models/Sales.model");
const SaleItem = require("../models/SalesItem.model");
const fs = require("fs");
const path = require("path");
const { emit } = require("../events/producer");

/**
 * Get invoice by ID with PDF URL
 */
const getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findByPk(invoiceId, {
      include: [
        {
          model: Sale,
          as: "sale",
          include: [{ model: SaleItem, as: "items" }],
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    return res.json({
      ...invoice.toJSON(),
      pdfUrl: invoice.pdfUrl
    });
  } catch (error) {
    console.error("❌ getInvoice error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Get all invoices for a company
 */
const getInvoicesByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const invoices = await Invoice.findAll({
      include: [
        {
          model: Sale,
          as: "sale",
          where: { companyId },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(
      invoices.map((inv) => ({
        ...inv.toJSON(),
        pdfUrl: inv.pdfUrl
      }))
    );
  } catch (error) {
    console.error("❌ getInvoicesByCompany error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Download invoice PDF (Redirect to Cloudinary or handle async)
 */
const downloadInvoicePdf = async (req, res) => {
  // Deprecated: Client should use the URL provided in getInvoice
  res.status(410).json({ message: "Please use the pdfUrl from the invoice details to download." });
};

/**
 * Generate PDF for an invoice (Async Trigger)
 */
const generateInvoicePdf = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Get invoice with related data
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [
        {
          model: Sale,
          as: "sale",
          include: [{ model: SaleItem, as: "items" }],
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const sale = invoice.sale;

    // Emit Event
    const currency = "RWF"; // Standard default

    await emit('document.invoice.requested', {
      type: 'document.invoice.requested',
      payload: {
        invoiceData: invoice.toJSON(),
        saleData: sale.toJSON(),
        items: sale.items.map((item) => item.toJSON()),
        currency: currency,
        companyData: { name: "INVEXIS", email: "info@invexis.com", companyId: sale.companyId }
      },
      owner: {
        level: 'company',
        companyId: sale.companyId,
        shopId: sale.shopId
      },
      eventId: `evt_inv_${invoice.invoiceId}_${Date.now()}`
    });

    return res.json({
      message: "PDF generation started successfully. Check back shortly.",
      status: "pending"
    });
  } catch (error) {
    console.error("❌ generateInvoicePdf error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * View invoice PDF (Redirect)
 */
const viewInvoicePdf = async (req, res) => {
  // Deprecated: Client should use the URL provided in getInvoice
  res.status(410).json({ message: "Please use the pdfUrl from the invoice details to view." });
};

/**
 * Delete invoice PDF
 */
const deleteInvoicePdf = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findByPk(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Logic to delete from Document Service / Cloudinary via event could be added here
    await invoice.update({ pdfUrl: null });

    return res.json({ message: "PDF reference cleared" });
  } catch (error) {
    console.error("❌ deleteInvoicePdf error:", error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getInvoice,
  getInvoicesByCompany,
  downloadInvoicePdf,
  generateInvoicePdf,
  viewInvoicePdf,
  deleteInvoicePdf,
};


