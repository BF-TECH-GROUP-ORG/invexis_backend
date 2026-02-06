const { client } = require('/app/shared/rabbitmq');
const { v4: uuidv4 } = require('uuid');

/**
 * Report Event Producer
 * Emits events to request offloaded operations (e.g. Document Generation)
 */
const ReportEventProducer = {

    /**
     * Request a report document generation (PDF/Excel)
     * @param {Object} data - { companyId, shopId, format, title, headers, rows, summary }
     */
    async requestReportGeneration(data) {
        try {
            const eventId = uuidv4();
            const payload = {
                payload: {
                    reportId: uuidv4(),
                    title: data.title,
                    subtitle: data.subtitle,
                    headers: data.headers, // Array of strings (PDF) or Objects (Excel)? 
                    // Let's standardize on Objects for maximum flexibility or handle both in Generator.
                    // Generator supports objects for Excel and strings for PDF headers.
                    // We should probably normalize here or let Generator handle mismatch.
                    // Current Generator expects:
                    // Excel: columns=[{header, key, width}]
                    // PDF: headers=['A', 'B']
                    // We should pass both or specific props.

                    columns: data.columns, // For Excel
                    headers: data.pdfHeaders || data.headers, // For PDF
                    rows: data.rows, // Array of Arrays (PDF) or Objects (Excel)

                    // NOTE: This IS a problem. 
                    // PDF Generator expects Array<Array<String>>
                    // Excel Generator expects Array<Object>
                    // We need to pass the raw data and let the Consumer format it? 
                    // OR we send what the specific format needs. The Controller knows the format.

                    sheetName: data.sheetName || 'Report',
                    summary: data.summary,
                    companyData: data.companyData, // Pass branding info
                    context: {
                        requester: data.requester || 'system',
                        triggeredAt: new Date()
                    }
                },
                owner: {
                    companyId: data.companyId,
                    shopId: data.shopId
                },
                eventId: eventId,
                format: data.format || 'pdf',
                timestamp: new Date()
            };

            const exchange = 'events_topic';
            const routingKey = 'document.report.requested';

            await client.publish(exchange, routingKey, payload);
            console.log(`[ReportProducer] 📤 Requested ${data.format} report: ${data.title}`);
            return true;

        } catch (error) {
            console.error('[ReportProducer] ❌ Failed to publish report request:', error);
            return false;
        }
    }
};

module.exports = ReportEventProducer;
