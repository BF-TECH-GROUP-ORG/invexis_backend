const PDFDocument = require("pdfkit");
const stream = require('stream');

/**
 * Generate a generic PDF Report Stream
 * @param {string} title - Report Title
 * @param {Array} data - Report Data
 * @param {object} template - Optional Template Info
 * @returns {stream.PassThrough}
 */
const generatePdfStream = (title, data, template = {}) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const passthrough = new stream.PassThrough();

    doc.pipe(passthrough);

    try {
        // Header
        doc.fontSize(20).font("Helvetica-Bold").text(title.toUpperCase(), { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).font("Helvetica").text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Data Table (Generic)
        if (data && Array.isArray(data) && data.length > 0) {
            const keys = Object.keys(data[0]);
            const colWidth = 500 / keys.length;

            // Header Row
            let currentX = 50;
            const headerY = doc.y;
            keys.forEach(key => {
                doc.fontSize(10).font("Helvetica-Bold").text(key.toUpperCase(), currentX, headerY, { width: colWidth, truncate: true });
                currentX += colWidth;
            });
            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);

            // Data Rows
            data.forEach(row => {
                let rowX = 50;
                const rowY = doc.y;
                keys.forEach(key => {
                    doc.fontSize(9).font("Helvetica").text(String(row[key] || ''), rowX, rowY, { width: colWidth, truncate: true });
                    rowX += colWidth;
                });
                doc.moveDown();

                // Page break if needed
                if (doc.y > 700) {
                    doc.addPage();
                }
            });
        } else {
            doc.fontSize(12).text("No data available for this report.");
        }

        // Footer
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(`Page ${i + 1} of ${range.count}`, 50, 750, { align: 'center' });
        }

        doc.end();
    } catch (err) {
        passthrough.emit('error', err);
    }

    return passthrough;
};

module.exports = { generatePdfStream };
