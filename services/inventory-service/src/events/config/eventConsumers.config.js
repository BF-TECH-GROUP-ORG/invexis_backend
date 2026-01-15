
/**
 * Event Consumers Configuration
 * Defines all events that inventory-service consumes from other services
 * Used by consumer.js to register consumers
 */

module.exports = [
  {
    name: "sales",
    queue: "inventory_sales_events",
    exchange: "events_topic",
    pattern: "sale.#",
    handler: require("../handlers/salesEvent.handler"),
    events: [
      "sale.created",
      "sale.cancelled",
      "sale.canceled",
      "sale.return.confirmed",
      "sale.return.fully_returned",
      "sale.return.restore_stock"
    ]
  },
  {
    name: "ecommerce",
    queue: "inventory_ecommerce_events",
    exchange: "events_topic",
    pattern: "ecommerce.#",
    handler: require("../handlers/ecommerceEvent.handler"),
    events: [
      "ecommerce.order.created",
      "ecommerce.order.updated",
      "ecommerce.order.cancelled",
      "ecommerce.cart.checked_out"
    ]
  },
  {
    name: "shop",
    queue: "inventory_shop_events",
    exchange: "events_topic",
    pattern: "shop.#",
    handler: require("../handlers/shopEvent.handler"),
    events: [
      "shop.created",
      "shop.deleted"
    ]
  },
  {
    name: "company",
    queue: "inventory_company_events",
    exchange: "events_topic",
    pattern: "company.#",
    handler: require("../handlers/companyEvent.handler"),
    events: [
      "company.deleted"
    ]
  },
  {
    name: "alerts",
    queue: "inventory_alert_events",
    exchange: "events_topic",
    pattern: "product.#|order.#|inventory.#|stock.#",
    handler: require("../handlers/alertEvent.handler"),
    events: [
      "product.created",
      "product.price_changed",
      "product.stock_changed",
      "order.created",
      "order.shipped",
      "order.delivered",
      "inventory.adjusted",
      "stock.received"
    ]
  },
  {
    name: "documents",
    queue: "inventory_document_events",
    exchange: "events_topic",
    pattern: "document.product.*.created",
    handler: require("../../utils/events/documentHandler"),
    events: [
      "document.product.qr.created",
      "document.product.barcode.created",
      "document.product.image.created",
      "document.product.video.created"
    ]
  }
];

