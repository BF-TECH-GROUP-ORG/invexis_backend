const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment'); // Using native moment if available or standard dates

/**
 * Report Generator Service
 * Centralized logic for creating PDF and Excel reports
 */
class ReportGenerator {

    /**
     * Generate an Excel file from data
     * @param {Array} data - Array of objects
     * @param {Array} columns - Array of { header, key, width }
     * @param {String} sheetName - Name of the worksheet
     * @returns {Promise<Buffer>}
     */
    static async generateExcel(data, columns, sheetName = 'Report') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);

        // Styling
        worksheet.columns = columns.map(col => ({
            header: col.header,
            key: col.key,
            width: col.width || 20
        }));

        // Header Style
        worksheet.getRow(1).font = { bold: true, size: 12 };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEEEEEE' }
        };

        // Add Data
        worksheet.addRows(data);

        // Auto-filter
        worksheet.autoFilter = {
            from: {
                row: 1,
                column: 1
            },
            to: {
                row: 1,
                column: columns.length
            }
        };

        return await workbook.xlsx.writeBuffer();
    }

    /**
     * Generate a PDF report
     * @param {Object} content - { title, subtitle, headers, rows, summary }
     * @returns {Promise<Buffer>}
     */
    static async generatePDF(content) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                const colors = {
                    primary: "#f97316",
                    text: "#1f2937",
                    muted: "#6b7280",
                    border: "#e5e7eb"
                };

                // 1. Brand Header (If provided)
                if (content.companyData) {
                    const cd = content.companyData;
                    doc.fillColor(colors.primary)
                        .fontSize(22)
                        .font("Helvetica-Bold")
                        .text(cd.name || "INVEXIS", 50, 50);

                    if (cd.shopName) {
                        doc.fillColor(colors.text)
                            .fontSize(14)
                            .font("Helvetica-Bold")
                            .text(cd.shopName, 50, 75);
                    }

                    const detailsTop = cd.shopName ? 95 : 75;
                    doc.fillColor(colors.muted)
                        .fontSize(9)
                        .font("Helvetica")
                        .text(cd.address || "", 50, detailsTop, { width: 250 })
                        .text(cd.phone ? `Phone: ${cd.phone}` : "", 50, doc.y + 2)
                        .text(cd.email ? `Email: ${cd.email}` : "", 50, doc.y + 2);

                    doc.moveTo(50, 130).lineTo(doc.page.width - 50, 130).strokeColor(colors.border).stroke();
                    doc.moveDown(3);
                }

                // 2. Report Title Section
                const titleTop = content.companyData ? 150 : 50;
                doc.fillColor(colors.primary)
                    .fontSize(20)
                    .font('Helvetica-Bold')
                    .text(content.title || 'Report', 50, titleTop, { align: 'center' });

                if (content.subtitle) {
                    doc.fillColor(colors.muted)
                        .fontSize(11)
                        .font('Helvetica')
                        .text(content.subtitle, { align: 'center' });
                }

                const generatedDate = new Date().toISOString().split('T')[0];
                doc.fontSize(9).fillColor(colors.muted).text(`Generated: ${generatedDate}`, { align: 'right' });
                doc.moveDown(2);

                // Table Logic (Simple)
                if (content.headers && content.rows) {
                    const tableTop = doc.y;
                    const itemWidth = (doc.page.width - 100) / content.headers.length;

                    // Draw Headers
                    let xPosition = 50;
                    doc.font('Helvetica-Bold');
                    content.headers.forEach(header => {
                        doc.text(header, xPosition, tableTop, { width: itemWidth, align: 'left' });
                        xPosition += itemWidth;
                    });

                    doc.moveTo(50, tableTop + 15).lineTo(doc.page.width - 50, tableTop + 15).stroke();
                    doc.moveDown();

                    // Draw Rows
                    doc.font('Helvetica');
                    let yPosition = tableTop + 25;

                    content.rows.forEach((row, i) => {
                        // Check pagination
                        if (yPosition > doc.page.height - 50) {
                            doc.addPage();
                            yPosition = 50;
                        }

                        let xPos = 50;
                        row.forEach(cell => {
                            const params = { width: itemWidth, align: 'left' };
                            doc.text(String(cell), xPos, yPosition, params);
                            xPos += itemWidth;
                        });
                        yPosition += 20;
                    });
                }

                // Summary Section
                if (content.summary) {
                    doc.addPage(); // Start summary on new page if needed, or just ensure spacing
                    doc.moveDown(2);
                    doc.font('Helvetica-Bold').text('Summary', { underline: true });
                    doc.moveDown(0.5);
                    doc.font('Helvetica');
                    Object.entries(content.summary).forEach(([key, value]) => {
                        doc.text(`${key}: ${value}`);
                    });
                }

                doc.end();

            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = ReportGenerator;
