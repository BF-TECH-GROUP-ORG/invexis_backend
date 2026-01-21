/**
 * Event Consumers Configuration - Debt Service
 * Defines all events that debt-service consumes from other services
 * Used by consumer.js to register consumers
 */

module.exports = [
    {
        name: "sales",
        queue: "debt_sales_events",
        exchange: "events_topic",
        pattern: "sale.#",
        handler: require("../handlers/salesEvent.handler"),
        events: [
            "sale.created",
            "sale.payment.status.changed",
            "sale.cancelled"
        ]
    },
    {
        name: "payment",
        queue: "debt_payment_events",
        exchange: "events_topic",
        pattern: "payment.#",
        additionalPatterns: ["document.#"],
        handler: require("../handlers/paymentEvent.handler"),
        events: [
            "payment.processed",
            "payment.succeeded",
            "payment.failed",
            "payment.refunded",
            "document.invoice.created"
        ]
    }
];
