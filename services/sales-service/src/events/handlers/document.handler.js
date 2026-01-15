const { Invoice } = require("../../models/index.model");

/**
 * Handle document events
 * @param {object} event - Event payload
 * @param {string} routingKey - Event routing key
 */
const handleDocumentEvent = async (event, routingKey) => {
    try {
        console.log(`📄 Sales Service received document event: ${routingKey}`);

        if (routingKey === 'document.invoice.created') {
            const { url, context } = event;
            const { invoiceId } = context;

            if (invoiceId && url) {
                const invoice = await Invoice.findByPk(invoiceId);
                if (invoice) {
                    await invoice.update({ pdfUrl: url });
                    console.log(`✅ Invoice ${invoiceId} updated with PDF URL: ${url}`);
                } else {
                    console.warn(`⚠️ Invoice ${invoiceId} not found for PDF update`);
                }
            }
        }

    } catch (err) {
        console.error('❌ Error handling document event:', err);
        throw err;
    }
};

module.exports = handleDocumentEvent;
