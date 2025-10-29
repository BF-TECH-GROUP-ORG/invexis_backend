const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

/**
 * Invoice PDF Generation Service
 * Generates professional PDF invoices and stores them locally or in cloud storage
 */
class InvoicePdfService {
  /**
   * Ensure PDF storage directory exists
   */
  static ensureStorageDirectory() {
    const pdfDir = path.join(__dirname, "../../storage/invoices");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    return pdfDir;
  }

  /**
   * Generate PDF invoice
   * @param {object} invoiceData - Invoice data from database
   * @param {object} saleData - Sale data from database
   * @param {array} items - Sale items
   * @param {object} companyData - Company data (optional)
   * @returns {object} - { pdfPath, pdfUrl, fileName }
   */
  static async generateInvoicePdf(invoiceData, saleData, items = [], companyData = {}) {
    try {
      const pdfDir = this.ensureStorageDirectory();
      const fileName = `INV-${invoiceData.invoiceNumber}-${uuidv4().substring(0, 8)}.pdf`;
      const filePath = path.join(pdfDir, fileName);

      // Create PDF document
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      // Pipe to file
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Header - Company Info
      this.addHeader(doc, companyData);

      // Invoice Title and Details
      this.addInvoiceTitle(doc, invoiceData);

      // Bill To and Ship To
      this.addBillingInfo(doc, saleData);

      // Items Table
      this.addItemsTable(doc, items, invoiceData);

      // Totals Section
      this.addTotals(doc, invoiceData);

      // Footer
      this.addFooter(doc);

      // Finalize PDF
      doc.end();

      // Return promise that resolves when stream finishes
      return new Promise((resolve, reject) => {
        stream.on("finish", () => {
          const pdfUrl = `/invoices/pdf/${fileName}`;
          resolve({
            pdfPath: filePath,
            pdfUrl,
            fileName,
          });
        });
        stream.on("error", reject);
      });
    } catch (error) {
      console.error("❌ Error generating PDF:", error.message);
      throw error;
    }
  }

  /**
   * Add header with company information
   */
  static addHeader(doc, companyData) {
    // Company Name
    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .text(companyData.name || "INVEXIS", 50, 50);

    // Company Details
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(companyData.address || "Company Address", 50, 80)
      .text(companyData.phone || "Phone: N/A", 50, 95)
      .text(companyData.email || "Email: N/A", 50, 110);

    // Horizontal line
    doc.moveTo(50, 130).lineTo(550, 130).stroke();
  }

  /**
   * Add invoice title and key details
   */
  static addInvoiceTitle(doc, invoiceData) {
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("INVOICE", 50, 150);

    // Invoice details in two columns
    const detailsX = 300;
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Invoice #: ${invoiceData.invoiceNumber}`, detailsX, 150)
      .text(`Date: ${new Date(invoiceData.issueDate).toLocaleDateString()}`, detailsX, 165)
      .text(
        `Due Date: ${invoiceData.dueDate ? new Date(invoiceData.dueDate).toLocaleDateString() : "N/A"}`,
        detailsX,
        180
      )
      .text(`Status: ${invoiceData.status?.toUpperCase() || "ISSUED"}`, detailsX, 195);
  }

  /**
   * Add billing information
   */
  static addBillingInfo(doc, saleData) {
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("BILL TO:", 50, 240);

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(saleData.customerName || "Customer Name", 50, 260)
      .text(saleData.customerPhone || "Phone: N/A", 50, 275)
      .text(saleData.customerAddress || "Address: N/A", 50, 290);
  }

  /**
   * Add items table
   */
  static addItemsTable(doc, items, invoiceData) {
    const tableTop = 330;
    const col1X = 50;
    const col2X = 250;
    const col3X = 350;
    const col4X = 450;

    // Table header
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("Description", col1X, tableTop)
      .text("Qty", col2X, tableTop)
      .text("Unit Price", col3X, tableTop)
      .text("Total", col4X, tableTop);

    // Horizontal line under header
    doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke();

    // Table rows
    let yPosition = tableTop + 30;
    items.forEach((item) => {
      const description = item.productName || `Product ${item.productId}`;
      const qty = item.quantity || 0;
      const unitPrice = parseFloat(item.unitPrice || 0).toFixed(2);
      const total = parseFloat(item.totalPrice || 0).toFixed(2);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(description, col1X, yPosition)
        .text(qty.toString(), col2X, yPosition)
        .text(`$${unitPrice}`, col3X, yPosition)
        .text(`$${total}`, col4X, yPosition);

      yPosition += 25;
    });

    // Horizontal line after items
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
  }

  /**
   * Add totals section
   */
  static addTotals(doc, invoiceData) {
    let yPosition = 500;

    const subTotal = parseFloat(invoiceData.subTotal || 0).toFixed(2);
    const discount = parseFloat(invoiceData.discountTotal || 0).toFixed(2);
    const tax = parseFloat(invoiceData.taxTotal || 0).toFixed(2);
    const total = parseFloat(invoiceData.totalAmount || 0).toFixed(2);

    // Subtotal
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Subtotal:", 350, yPosition)
      .text(`$${subTotal}`, 450, yPosition);

    yPosition += 20;

    // Discount
    if (parseFloat(discount) > 0) {
      doc
        .text("Discount:", 350, yPosition)
        .text(`-$${discount}`, 450, yPosition);
      yPosition += 20;
    }

    // Tax
    if (parseFloat(tax) > 0) {
      doc
        .text("Tax:", 350, yPosition)
        .text(`$${tax}`, 450, yPosition);
      yPosition += 20;
    }

    // Total (bold)
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("TOTAL:", 350, yPosition)
      .text(`$${total}`, 450, yPosition);
  }

  /**
   * Add footer
   */
  static addFooter(doc) {
    doc
      .fontSize(9)
      .font("Helvetica")
      .text("Thank you for your business!", 50, 700, { align: "center" })
      .text("Generated by Invexis Invoice System", 50, 715, { align: "center" });
  }

  /**
   * Get PDF file path
   */
  static getPdfPath(fileName) {
    const pdfDir = this.ensureStorageDirectory();
    return path.join(pdfDir, fileName);
  }

  /**
   * Check if PDF exists
   */
  static pdfExists(fileName) {
    const filePath = this.getPdfPath(fileName);
    return fs.existsSync(filePath);
  }

  /**
   * Delete PDF file
   */
  static deletePdf(fileName) {
    try {
      const filePath = this.getPdfPath(fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Error deleting PDF:", error.message);
      throw error;
    }
  }
}

module.exports = InvoicePdfService;

