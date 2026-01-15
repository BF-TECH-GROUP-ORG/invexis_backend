const PDFDocument = require("pdfkit");
const stream = require('stream');
const logger = require('../config/logger');

class InvoiceGenerator {
    /**
     * Generate Invoice PDF Stream
     * @param {object} payload - { invoiceData, saleData, items, companyData }
     * @returns {stream.PassThrough}
     */
    static generate(payload) {
        const { invoiceData, saleData, items, companyData, currency = "RWF" } = payload;
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const passthrough = new stream.PassThrough();

        doc.pipe(passthrough);

        try {
            // Header - Company Info
            this.addHeader(doc, companyData);

            // Invoice Title and Details
            this.addInvoiceTitle(doc, invoiceData);

            // Bill To and Ship To
            this.addBillingInfo(doc, saleData);

            // Items Table
            this.addItemsTable(doc, items || [], invoiceData);

            // Totals Section
            this.addTotals(doc, invoiceData, currency);

            // Footer
            this.addFooter(doc);

            doc.end();
        } catch (err) {
            passthrough.emit('error', err);
        }

        return passthrough;
    }

    static addHeader(doc, companyData) {
        doc.fontSize(24).font("Helvetica-Bold").text(companyData.name || "INVEXIS", 50, 50);
        doc.fontSize(10).font("Helvetica")
            .text(companyData.address || "Company Address", 50, 80)
            .text(companyData.phone || "Phone: N/A", 50, 95)
            .text(companyData.email || "Email: N/A", 50, 110);
        doc.moveTo(50, 130).lineTo(550, 130).stroke();
    }

    static addInvoiceTitle(doc, invoiceData) {
        doc.fontSize(16).font("Helvetica-Bold").text("INVOICE", 50, 150);
        const detailsX = 300;
        doc.fontSize(10).font("Helvetica")
            .text(`Invoice #: ${invoiceData.invoiceNumber}`, detailsX, 150)
            .text(`Date: ${new Date(invoiceData.issueDate || invoiceData.createdAt).toLocaleDateString()}`, detailsX, 165)
            .text(`Due Date: ${invoiceData.dueDate ? new Date(invoiceData.dueDate).toLocaleDateString() : "N/A"}`, detailsX, 180)
            .text(`Status: ${invoiceData.status?.toUpperCase() || "ISSUED"}`, detailsX, 195);
    }

    static addBillingInfo(doc, saleData) {
        doc.fontSize(11).font("Helvetica-Bold").text("BILL TO:", 50, 240);
        doc.fontSize(10).font("Helvetica")
            .text(saleData.customerName || "Customer Name", 50, 260)
            .text(saleData.customerPhone || "Phone: N/A", 50, 275)
            .text(saleData.customerAddress || "Address: N/A", 50, 290);
    }

    static addItemsTable(doc, items, invoiceData, currency = "RWF") {
        const tableTop = 330;
        const col1X = 50;
        const col2X = 250;
        const col3X = 350;
        const col4X = 450;

        // Number Formatter
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency === 'RWF' ? 'RWF' : currency,
            minimumFractionDigits: currency === 'RWF' ? 0 : 2
        });

        doc.fontSize(11).font("Helvetica-Bold")
            .text("Description", col1X, tableTop)
            .text("Qty", col2X, tableTop)
            .text("Unit Price", col3X, tableTop)
            .text("Total", col4X, tableTop);

        doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke();

        let yPosition = tableTop + 30;
        items.forEach((item) => {
            const description = item.productName || `Product ${item.productId}`;
            const qty = item.quantity || 0;
            const unitPriceValue = parseFloat(item.unitPrice || 0);
            const totalValue = parseFloat(item.total || item.totalPrice || 0);

            doc.fontSize(10).font("Helvetica")
                .text(description, col1X, yPosition)
                .text(qty.toString(), col2X, yPosition)
                .text(formatter.format(unitPriceValue), col3X, yPosition)
                .text(formatter.format(totalValue), col4X, yPosition);

            yPosition += 25;
        });

        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    }

    static addTotals(doc, invoiceData, currency = "RWF") {
        let yPosition = 500;
        const subTotal = parseFloat(invoiceData.subTotal || 0);
        const discount = parseFloat(invoiceData.discountTotal || 0);
        const tax = parseFloat(invoiceData.taxTotal || 0);
        const total = parseFloat(invoiceData.totalAmount || 0);

        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency === 'RWF' ? 'RWF' : currency,
            minimumFractionDigits: currency === 'RWF' ? 0 : 2
        });

        doc.fontSize(10).font("Helvetica").text("Subtotal:", 350, yPosition).text(formatter.format(subTotal), 450, yPosition);
        yPosition += 20;

        if (discount > 0) {
            doc.text("Discount:", 350, yPosition).text(`-${formatter.format(discount)}`, 450, yPosition);
            yPosition += 20;
        }
        if (tax > 0) {
            doc.text("Tax:", 350, yPosition).text(formatter.format(tax), 450, yPosition);
            yPosition += 20;
        }
        doc.fontSize(12).font("Helvetica-Bold").text("TOTAL:", 350, yPosition).text(formatter.format(total), 450, yPosition);
    }

    static addFooter(doc) {
        doc.fontSize(9).font("Helvetica")
            .text("Thank you for your business!", 50, 700, { align: "center" })
            .text("Generated by Invexis Invoice System", 50, 715, { align: "center" });
    }
}

module.exports = InvoiceGenerator;
