"use strict";

const { exchanges } = require("/app/shared/rabbitmq");

module.exports = [
  {
    name: "Sale Lifecycle Events",
    exchange: exchanges.topic,
    events: [
      { key: "sale.created", description: "A new sale was created" },
      { key: "sale.updated", description: "Sale details updated" },
      { key: "sale.completed", description: "Sale successfully completed" },
      { key: "sale.cancelled", description: "Sale was cancelled" },
      { key: "sale.status.changed", description: "Sale status changed" },
    ],
  },
  {
    name: "Sale Payment Events",
    exchange: exchanges.topic,
    events: [
      {
        key: "sale.payment.pending",
        description: "Sale payment is pending",
      },
      {
        key: "sale.payment.completed",
        description: "Sale payment completed successfully",
      },
      {
        key: "sale.payment.failed",
        description: "Sale payment failed",
      },
      {
        key: "sale.payment.refunded",
        description: "Sale payment was refunded",
      },
      {
        key: "sales.payment.requested",
        description: "Request payment initiation (Mobile/Card) for a sale",
      },
    ],
  },

  {
    name: "Sales Return Events",
    exchange: exchanges.topic,
    events: [
      { key: "sale.return.created", description: "Return request created" },
      { key: "sale.return.approved", description: "Return request approved" },
      { key: "sale.return.rejected", description: "Return request rejected" },
      { key: "sale.return.completed", description: "Return process completed" },
      { key: "sale.return.restore_stock", description: "Restore stock in inventory for returned items" },
      { key: "sale.return.fully_returned", description: "Return fully processed and confirmed" },
      {
        key: "sale.refund.processed",
        description: "Refund processed for return",
      },
    ],
  },
  {
    name: "Sales Item Events",
    exchange: exchanges.topic,
    events: [
      { key: "sale.item.added", description: "Item added to sale" },
      { key: "sale.item.updated", description: "Sale item updated" },
      { key: "sale.item.removed", description: "Item removed from sale" },
    ],
  },

];
