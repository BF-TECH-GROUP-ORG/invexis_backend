const PDFDocument = require("pdfkit");
const stream = require('stream');
const logger = require('../config/logger');

class InvoiceGenerator {
    /**
     * Generate Invoice PDF Stream
     * @param {object} payload - { invoiceData, saleData, items, companyData, debtData, currency }
     * @returns {stream.PassThrough}
     */
    static generate(payload) {
        const { invoiceData, saleData, items, companyData, debtData, subscriptionData, currency = "RWF" } = payload;
        const doc = new PDFDocument({
            size: "A4",
            margin: 50,
            bufferPages: true
        });
        const passthrough = new stream.PassThrough();

        doc.pipe(passthrough);

        try {
            // Define Colors
            const colors = {
                primary: "#f97316", // Professional Orange
                text: "#1f2937",
                muted: "#6b7280",
                border: "#e5e7eb",
                success: "#059669",
                danger: "#dc2626"
            };

            // Layout Constants
            const margin = 50;
            const width = 595.28 - (margin * 2);

            // 0. Background Watermark (Rendered first)
            this.addWatermark(doc, invoiceData.status || "PAID");

            // 1. Header - Company Info (Modern Layout)
            this.addHeader(doc, companyData, colors, margin, width);

            // 2. Invoice Meta (ID, Date, Status)
            this.addInvoiceMeta(doc, invoiceData, colors, margin, width);

            // 3. Billing Info
            this.addBillingInfo(doc, saleData, colors, margin, width);

            // 4. Items Table (If present)
            let yPosition = 330;
            if (items && items.length > 0) {
                yPosition = this.addItemsTable(doc, items, currency, colors, margin, width, yPosition);
            } else {
                doc.fontSize(10).fillColor(colors.muted).text("No specific items listed for this transaction.", margin, yPosition);
                yPosition += 30;
            }

            // 5. Debt Balance Summary (Specific for Debt Repayment)
            if (debtData) {
                yPosition = this.addDebtSummary(doc, debtData, currency, colors, margin, width, yPosition);
            }

            // 6. Subscription Details (Specific for Platform Billing)
            if (subscriptionData) {
                yPosition = this.addSubscriptionSummary(doc, subscriptionData, colors, margin, width, yPosition);
            }

            // 7. Totals Section
            this.addTotals(doc, invoiceData, currency, colors, margin, width, yPosition);

            // 8. Footer
            this.addFooter(doc, colors, margin, width);

            doc.end();
        } catch (err) {
            logger.error("PDF Generation Error", err);
            passthrough.emit('error', err);
        }

        return passthrough;
    }

    static addWatermark(doc, status) {
        const text = `INVEXIX ${status.toUpperCase()}`;
        doc.save()
            .opacity(0.08)
            .fontSize(80)
            .font("Helvetica-Bold")
            .fillColor("#666666");

        // Center and Rotate - positioned to stay on one line
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;

        doc.rotate(-45, { origin: [pageWidth / 2, pageHeight / 2] })
            .text(text, 0, pageHeight / 2 - 40, {
                align: "center",
                width: pageWidth
            });

        doc.restore();
    }

    static addHeader(doc, companyData, colors, margin, width) {
        // Logo or Company Name
        doc.fillColor(colors.primary)
            .fontSize(24)
            .font("Helvetica-Bold")
            .text(companyData.name || "INVEXIS", margin, 50);

        if (companyData.shopName) {
            doc.fillColor(colors.text)
                .fontSize(14)
                .font("Helvetica-Bold")
                .text(companyData.shopName, margin, 75);
        }

        // Company Details
        const detailsTop = companyData.shopName ? 95 : 80;
        doc.fillColor(colors.text)
            .fontSize(10)
            .font("Helvetica")
            .text(companyData.address || "", margin, detailsTop, { width: width / 2 })
            .text(companyData.phone ? `Phone: ${companyData.phone}` : "", margin, doc.y + 2)
            .text(companyData.email ? `Email: ${companyData.email}` : "", margin, doc.y + 2);

        doc.moveTo(margin, 130).lineTo(margin + width, 130).strokeColor(colors.border).stroke();
    }

    static addInvoiceMeta(doc, invoiceData, colors, margin, width) {
        doc.fillColor(colors.primary)
            .fontSize(16)
            .font("Helvetica-Bold")
            .text("INVOICE", margin, 150);

        const status = invoiceData.status?.toUpperCase() || "PAID";
        const statusColor = status === "PAID" ? colors.success : (status === "FAILED" ? colors.danger : colors.muted);

        doc.fontSize(10).font("Helvetica").fillColor(colors.text);

        const detailsX = margin + width - 170; // Moved further left to accommodate long IDs
        const lineSpacing = 20; // Increased spacing
        const valueOffset = 75; // Increased offset to prevent overlap
        let y = 150;

        doc.text(`Invoice #:`, detailsX, y);
        doc.font("Helvetica-Bold").text(invoiceData.invoiceNumber || "N/A", detailsX + valueOffset, y);

        y += lineSpacing;
        doc.font("Helvetica").text(`Date:`, detailsX, y);
        doc.text(new Date(invoiceData.issueDate || Date.now()).toLocaleDateString(), detailsX + valueOffset, y);

        y += lineSpacing;
        doc.font("Helvetica").fillColor(colors.text).text(`Payment Method:`, detailsX, y);
        const paymentMethod = invoiceData.paymentMethod || "N/A";
        doc.font("Helvetica-Bold").fillColor(colors.text).text(paymentMethod.toUpperCase(), detailsX + valueOffset, y);

        y += lineSpacing;
        doc.font("Helvetica").fillColor(colors.text).text(`Status:`, detailsX, y);
        doc.fillColor(statusColor).font("Helvetica-Bold").text(status, detailsX + valueOffset, y);
    }

    static addBillingInfo(doc, saleData, colors, margin, width) {
        doc.fillColor(colors.muted)
            .fontSize(10)
            .font("Helvetica-Bold")
            .text("BILL TO", margin, 240);

        doc.fillColor(colors.text)
            .fontSize(11)
            .font("Helvetica-Bold")
            .text(saleData.customerName || "Walking Customer", margin, 255);

        doc.fontSize(10).font("Helvetica")
            .text(saleData.customerPhone || "", margin, doc.y + 2);
    }

    static addItemsTable(doc, items, currency, colors, margin, width, yPosition) {
        const tableTop = yPosition;
        const colWidths = {
            desc: width * 0.5,
            qty: width * 0.1,
            price: width * 0.2,
            total: width * 0.2
        };

        const formatter = this.getFormatter(currency);

        // Header
        doc.fillColor(colors.muted)
            .fontSize(9)
            .font("Helvetica-Bold")
            .text("ITEM", margin, tableTop)
            .text("QTY", margin + colWidths.desc, tableTop, { width: colWidths.qty, align: "center" })
            .text("UNIT PRICE", margin + colWidths.desc + colWidths.qty, tableTop, { width: colWidths.price, align: "right" })
            .text("AMOUNT", margin + colWidths.desc + colWidths.qty + colWidths.price, tableTop, { width: colWidths.total, align: "right" });

        doc.moveTo(margin, tableTop + 15).lineTo(margin + width, tableTop + 15).strokeColor(colors.border).stroke();

        let y = tableTop + 25;
        doc.fillColor(colors.text).font("Helvetica").fontSize(10);

        items.forEach(item => {
            const desc = item.productName || item.name || "Item";
            const qty = item.quantity || item.qty || 1;
            const price = parseFloat(item.unitPrice || item.price || 0);
            const total = parseFloat(item.total || (qty * price));

            doc.text(desc, margin, y, { width: colWidths.desc - 10 });
            doc.text(qty.toString(), margin + colWidths.desc, y, { width: colWidths.qty, align: "center" });
            doc.text(formatter.format(price), margin + colWidths.desc + colWidths.qty, y, { width: colWidths.price, align: "right" });
            doc.text(formatter.format(total), margin + colWidths.desc + colWidths.qty + colWidths.price, y, { width: colWidths.total, align: "right" });

            y += 20;
            // Check for page break? Simplified for now.
        });

        doc.moveTo(margin, y).lineTo(margin + width, y).strokeColor(colors.border).stroke();
        return y + 20;
    }

    static addDebtSummary(doc, debtData, currency, colors, margin, width, yPosition) {
        const tableTop = yPosition;
        const formatter = this.getFormatter(currency);

        doc.fillColor(colors.primary)
            .fontSize(11)
            .font("Helvetica-Bold")
            .text("DEBT BALANCE SUMMARY", margin, tableTop);

        doc.rect(margin, tableTop + 15, width, 70).fillAndStroke("#f8fafc", colors.border);

        let y = tableTop + 25;
        doc.fillColor(colors.text).fontSize(10).font("Helvetica");

        const labelX = margin + 15;
        const valueX = margin + width - 150;

        doc.text("Total Debt Amount:", labelX, y).font("Helvetica-Bold").text(formatter.format(debtData.totalDebtAmount || 0), valueX, y, { align: "right", width: 135 });

        y += 15;
        doc.font("Helvetica").text("Previous Balance:", labelX, y).font("Helvetica-Bold").text(formatter.format(debtData.balanceBeforeRepayment || 0), valueX, y, { align: "right", width: 135 });

        y += 15;
        doc.font("Helvetica").text("Amount Paid in this Transaction:", labelX, y).fillColor(colors.success).font("Helvetica-Bold").text(`- ${formatter.format(debtData.amountPaidNow || 0)}`, valueX, y, { align: "right", width: 135 });

        y += 20;
        doc.fillColor(colors.text).font("Helvetica-Bold").text("REMAINING BALANCE:", labelX, y).text(formatter.format(debtData.remainingBalance || 0), valueX, y, { align: "right", width: 135 });

        return y + 40;
    }

    static addSubscriptionSummary(doc, subscriptionData, colors, margin, width, yPosition) {
        const tableTop = yPosition;

        doc.fillColor(colors.primary)
            .fontSize(11)
            .font("Helvetica-Bold")
            .text("SUBSCRIPTION DETAILS", margin, tableTop);

        doc.rect(margin, tableTop + 15, width, 55).fillAndStroke("#f1f5f9", colors.border);

        let y = tableTop + 25;
        doc.fillColor(colors.text).fontSize(10).font("Helvetica");

        const labelX = margin + 15;
        const valueX = margin + width - 150;

        doc.text("Plan Name:", labelX, y).font("Helvetica-Bold").text(subscriptionData.planName || "Premium", valueX, y, { align: "right", width: 135 });

        y += 15;
        doc.font("Helvetica").text("Billing Cycle:", labelX, y).text(subscriptionData.billingCycle || "Monthly", valueX, y, { align: "right", width: 135 });

        y += 15;
        doc.font("Helvetica").text("Valid Until:", labelX, y).fillColor(colors.primary).font("Helvetica-Bold").text(subscriptionData.validUntil ? new Date(subscriptionData.validUntil).toLocaleDateString() : "Next Billing Cycle", valueX, y, { align: "right", width: 135 });

        return y + 30;
    }

    static addTotals(doc, invoiceData, currency, colors, margin, width, yPosition) {
        const formatter = this.getFormatter(currency);
        let y = yPosition;

        const totalWidth = 150;
        const x = margin + width - totalWidth;

        if (invoiceData.subTotal && parseFloat(invoiceData.subTotal) !== parseFloat(invoiceData.totalAmount)) {
            doc.fillColor(colors.muted).fontSize(10).font("Helvetica")
                .text("Subtotal:", x, y, { width: totalWidth / 2 })
                .text(formatter.format(invoiceData.subTotal), x + totalWidth / 2, y, { align: "right", width: totalWidth / 2 });
            y += 18;
        }

        doc.fillColor(colors.text).fontSize(12).font("Helvetica-Bold")
            .text("TOTAL PAID:", x, y, { width: totalWidth / 2 })
            .text(formatter.format(invoiceData.totalAmount), x + totalWidth / 2, y, { align: "right", width: totalWidth / 2 });
    }

    static addFooter(doc, colors, margin, width) {
        const bottom = 750;
        doc.moveTo(margin, bottom).lineTo(margin + width, bottom).strokeColor(colors.border).stroke();

        doc.fillColor(colors.muted)
            .fontSize(9)
            .font("Helvetica")
            .text("Thank you for your business!", margin, bottom + 15, { align: "center", width: width })
            .text("Generated by Invexis Global Payment Node", margin, bottom + 28, { align: "center", width: width });
    }

    static getFormatter(currency) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency === 'RWF' ? 'RWF' : (currency || 'XAF'),
            minimumFractionDigits: currency === 'RWF' ? 0 : 2
        });
    }
}

module.exports = InvoiceGenerator;
