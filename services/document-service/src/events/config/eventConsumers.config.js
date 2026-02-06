/**
 * Event Consumers Configuration
 * Defines all events that document-service consumes from other services
 * Using separate queues for different domains to avoid consumer conflicts
 */

module.exports = [
    {
        name: "products",
        queue: "document_product_requests",
        exchange: "events_topic",
        pattern: "document.product.*.requested",
        handler: require("../../handlers/documentEvent.handler"),
        events: [
            "document.product.qr.requested",
            "document.product.barcode.requested",
            "document.product.image.requested",
            "document.product.video.requested"
        ]
    },
    {
        name: "companies",
        queue: "document_company_requests",
        exchange: "events_topic",
        pattern: "document.company.*.requested",
        handler: require("../../handlers/documentEvent.handler"),
        events: [
            "document.company.verification.requested"
        ]
    },
    {
        name: "invoices",
        queue: "document_invoice_requests",
        exchange: "events_topic",
        pattern: "document.invoice.requested",
        handler: require("../../handlers/invoiceEvent.handler"),
        events: [
            "document.invoice.requested"
        ]
    },
    {
        name: "reports",
        queue: "document_report_requests",
        exchange: "events_topic",
        pattern: "document.report.requested",
        handler: require("../../handlers/reportEvent.handler"),
        events: [
            "document.report.requested"
        ]
    }
];