const rabbitmq = require('/app/shared/rabbitmq.js');
const logger = require('../config/logger');
const { uploadStream } = require('../services/cloudinaryService');
const ReportGenerator = require('../services/ReportGenerator');
const crypto = require('crypto');

/**
 * Retry helper for robust operations
 */
const withRetry = async (fn, retries = 3, delay = 1000) => {
    try {
        return await fn();
    } catch (err) {
        if (retries === 0) throw err;
        logger.warn(`Operation failed, retrying in ${delay}ms... (${retries} retries left) - ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 2);
    }
};

const handleReportRequest = async (event) => {
    const { payload, owner, eventId, format = 'pdf' } = event;
    const reportTitle = payload.title || 'Report';
    const companyId = owner?.companyId || 'unknown';
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    logger.info(`Generating ${format.toUpperCase()} Report: ${reportTitle} for ${companyId}`);

    let stream;
    let fileExtension;
    let contentType;

    try {
        if (format === 'excel') {
            const buffer = await ReportGenerator.generateExcel(
                payload.rows || [],
                payload.columns || [],
                payload.sheetName || 'Report'
            );
            const { Readable } = require('stream');
            stream = new Readable();
            stream.push(buffer);
            stream.push(null);
            fileExtension = 'xlsx';
            contentType = 'raw';
        } else {
            const buffer = await ReportGenerator.generatePDF({
                title: payload.title,
                subtitle: payload.subtitle,
                headers: payload.headers,
                rows: payload.rows,
                summary: payload.summary,
                companyData: payload.companyData // Passing branding info
            });
            const { Readable } = require('stream');
            stream = new Readable();
            stream.push(buffer);
            stream.push(null);
            fileExtension = 'pdf';
            contentType = 'pdf';
        }

        // 1. Intelligent Routing & Model Selection
        let Model;
        let domain = 'General';
        let docData = {
            documentId: payload.reportId || crypto.randomUUID(),
            displayName: `${reportTitle} - ${dateStr}`,
            owner: owner,
            period: {
                start: payload.period?.start || now,
                end: payload.period?.end || now
            },
            metadata: {
                title: reportTitle,
                generatedBy: payload.context?.requester || 'system',
                sourceEventId: eventId,
                context: payload.context
            }
        };

        const lowerTitle = reportTitle.toLowerCase();
        if (lowerTitle.includes('sales')) {
            Model = require('../models/SalesReport');
            domain = 'Sales';
        } else if (lowerTitle.includes('inventory')) {
            Model = require('../models/InventoryReport');
            domain = 'Inventory';
            docData.category = lowerTitle.includes('valuation') ? 'VALUATION' : 'STOCK_LEVEL';
        } else if (lowerTitle.includes('debt')) {
            Model = require('../models/DebtDocument');
            domain = 'Debt';
            docData.type = lowerTitle.includes('aging') ? 'AGING_ANALYSIS' : 'CREDIT_SUMMARY';
        } else if (lowerTitle.includes('performance') || lowerTitle.includes('staff') || lowerTitle.includes('branch')) {
            Model = require('../models/PerformanceReport');
            domain = 'Performance';
            docData.target = lowerTitle.includes('staff') ? 'STAFF' : (lowerTitle.includes('branch') ? 'BRANCH' : 'COMPANY');
            docData.targetId = payload.targetId;
        } else if (lowerTitle.includes('payment') || lowerTitle.includes('money') || lowerTitle.includes('trail')) {
            Model = require('../models/PaymentDocument');
            domain = 'Payments';
            docData.type = 'MONEY_TRAIL';
        } else {
            // General / BI / Executive
            Model = require('../models/FinanceReport');
            domain = 'Finance';
            docData.type = lowerTitle.includes('executive') ? 'EXECUTIVE' : (lowerTitle.includes('bi') ? 'BI' : 'GENERAL');
        }

        // Fallback to generic if still no model (unlikely with above logic)
        if (!Model) Model = require('../models/ReportDocument');

        // 2. Organized Storage Path
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const publicId = `${domain.toLowerCase()}_${companyId}_${Date.now()}`;
        const folder = `invexis/companies/${companyId}/reports/${year}/${month}/${domain}`;

        // 3. Upload & Save
        const result = await withRetry(() => uploadStream(stream, folder, publicId, contentType));

        docData.storage = {
            provider: 'cloudinary',
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            size: result.bytes
        };

        const doc = new Model(docData);
        await doc.save();

        // 4. Emit result
        await rabbitmq.publish('events_topic', 'document.report.created', {
            type: 'document.report.created',
            data: {
                reportId: docData.documentId,
                url: result.secure_url,
                displayName: docData.displayName,
                owner: owner,
                format: fileExtension,
                context: payload.context
            }
        });
        logger.info(`Report [${domain}] generated and organized: ${result.secure_url}`);

    } catch (err) {
        logger.error(`Failed to generate organized report ${reportTitle}`, err);
    }
};

const handleReportEvent = async (event, key) => {
    if (key === 'document.report.requested') {
        await handleReportRequest(event);
    } else {
        logger.warn(`No handler for report event key: ${key}`);
    }
};

module.exports = handleReportEvent;
