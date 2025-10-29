const Invoice = require("../models/Invoice.model");
const Sale = require("../models/Sales.model");
const SaleItem = require("../models/SaleItem.model");
const InvoicePdfService = require("../services/invoicePdf.service");
const fs = require("fs");
const path = require("path");

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
      pdfUrl: invoice.pdfUrl || `/invoices/pdf/${invoice.invoiceId}`,
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
        pdfUrl: inv.pdfUrl || `/invoices/pdf/${inv.invoiceId}`,
      }))
    );
  } catch (error) {
    console.error("❌ getInvoicesByCompany error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Download invoice PDF
 * GET /invoices/pdf/:fileName
 */
const downloadInvoicePdf = async (req, res) => {
  try {
    const { fileName } = req.params;

    // Security: Validate fileName to prevent directory traversal
    if (fileName.includes("..") || fileName.includes("/")) {
      return res.status(400).json({ error: "Invalid file name" });
    }

    const filePath = InvoicePdfService.getPdfPath(fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "PDF not found" });
    }

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    // Stream file to response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on("error", (error) => {
      console.error("❌ Error streaming PDF:", error);
      res.status(500).json({ error: "Error downloading PDF" });
    });
  } catch (error) {
    console.error("❌ downloadInvoicePdf error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Generate PDF for an invoice
 * POST /invoices/:invoiceId/generate-pdf
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

    // Generate PDF
    const pdfData = await InvoicePdfService.generateInvoicePdf(
      invoice.toJSON(),
      invoice.sale.toJSON(),
      invoice.sale.items.map((item) => item.toJSON()),
      { name: "INVEXIS", email: "info@invexis.com" }
    );

    // Update invoice with PDF URL
    await invoice.update({ pdfUrl: pdfData.pdfUrl });

    return res.json({
      message: "PDF generated successfully",
      pdfUrl: pdfData.pdfUrl,
      fileName: pdfData.fileName,
    });
  } catch (error) {
    console.error("❌ generateInvoicePdf error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * View invoice PDF in browser
 * GET /invoices/:invoiceId/view-pdf
 */
const viewInvoicePdf = async (req, res) => {
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

    // If PDF doesn't exist, generate it
    let pdfUrl = invoice.pdfUrl;
    if (!pdfUrl) {
      const pdfData = await InvoicePdfService.generateInvoicePdf(
        invoice.toJSON(),
        invoice.sale.toJSON(),
        invoice.sale.items.map((item) => item.toJSON()),
        { name: "INVEXIS", email: "info@invexis.com" }
      );
      pdfUrl = pdfData.pdfUrl;
      await invoice.update({ pdfUrl });
    }

    // Extract fileName from pdfUrl
    const fileName = pdfUrl.split("/").pop();
    const filePath = InvoicePdfService.getPdfPath(fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "PDF file not found" });
    }

    // Set response headers for inline viewing
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

    // Stream file to response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on("error", (error) => {
      console.error("❌ Error streaming PDF:", error);
      res.status(500).json({ error: "Error viewing PDF" });
    });
  } catch (error) {
    console.error("❌ viewInvoicePdf error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Delete invoice PDF
 * DELETE /invoices/:invoiceId/pdf
 */
const deleteInvoicePdf = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findByPk(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.pdfUrl) {
      const fileName = invoice.pdfUrl.split("/").pop();
      InvoicePdfService.deletePdf(fileName);
      await invoice.update({ pdfUrl: null });
    }

    return res.json({ message: "PDF deleted successfully" });
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

