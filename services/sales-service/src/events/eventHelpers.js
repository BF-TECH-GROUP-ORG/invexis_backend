"use strict";

const { v4: uuidv4 } = require("uuid");
const Outbox = require("../models/Outbox.model");

/**
 * Sales event helpers - Create outbox records for sales-related events
 * These are called from controllers within database transactions
 */
const saleEvents = {
  /**
   * Create outbox event for sale creation
   */
  async created(sale, trx = null) {
    return await Outbox.create(
      {
        type: "sale.created",
        exchange: "events_topic",
        routingKey: "sale.created",
        payload: {
          saleId: sale.saleId,
          companyId: sale.companyId,
          shopId: sale.shopId,
          customerId: sale.customerId,
          customerName: sale.customerName,
          totalAmount: sale.totalAmount,
          status: sale.status,
          paymentStatus: sale.paymentStatus,
          createdAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for sale completion
   */
  async completed(sale, trx = null) {
    return await Outbox.create(
      {
        type: "sale.completed",
        exchange: "events_topic",
        routingKey: "sale.completed",
        payload: {
          saleId: sale.saleId,
          companyId: sale.companyId,
          shopId: sale.shopId,
          customerId: sale.customerId,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          completedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for sale cancellation
   */
  async canceled(saleId, companyId, reason = "", trx = null) {
    return await Outbox.create(
      {
        type: "sale.canceled",
        exchange: "events_topic",
        routingKey: "sale.canceled",
        payload: {
          saleId,
          companyId,
          reason,
          canceledAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for sale status change
   */
  async statusChanged(saleId, companyId, oldStatus, newStatus, trx = null) {
    return await Outbox.create(
      {
        type: "sale.status.changed",
        exchange: "events_topic",
        routingKey: "sale.status.changed",
        payload: {
          saleId,
          companyId,
          oldStatus,
          newStatus,
          changedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for payment status change
   */
  async paymentStatusChanged(
    saleId,
    companyId,
    oldStatus,
    newStatus,
    trx = null
  ) {
    return await Outbox.create(
      {
        type: "sale.payment.status.changed",
        exchange: "events_topic",
        routingKey: "sale.payment.status.changed",
        payload: {
          saleId,
          companyId,
          oldStatus,
          newStatus,
          changedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },
};

/**
 * Invoice event helpers - Create outbox records for invoice-related events
 */
const invoiceEvents = {
  /**
   * Create outbox event for invoice creation
   */
  async created(invoice, sale, trx = null) {
    return await Outbox.create(
      {
        type: "invoice.created",
        exchange: "events_topic",
        routingKey: "invoice.created",
        payload: {
          invoiceId: invoice.invoiceId,
          saleId: invoice.saleId,
          companyId: sale.companyId,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          status: invoice.status,
          createdAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for invoice payment
   */
  async paid(invoiceId, saleId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "invoice.paid",
        exchange: "events_topic",
        routingKey: "invoice.paid",
        payload: {
          invoiceId,
          saleId,
          companyId,
          paidAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for invoice cancellation
   */
  async canceled(invoiceId, saleId, companyId, reason = "", trx = null) {
    return await Outbox.create(
      {
        type: "invoice.canceled",
        exchange: "events_topic",
        routingKey: "invoice.canceled",
        payload: {
          invoiceId,
          saleId,
          companyId,
          reason,
          canceledAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },
};

/**
 * Sales return event helpers - Create outbox records for return-related events
 */
const returnEvents = {
  /**
   * Create outbox event for return creation
   */
  async created(saleReturn, sale, trx = null) {
    return await Outbox.create(
      {
        type: "sale.return.created",
        exchange: "events_topic",
        routingKey: "sale.return.created",
        payload: {
          returnId: saleReturn.id,
          saleId: saleReturn.saleId,
          companyId: sale.companyId,
          reason: saleReturn.reason,
          refundAmount: saleReturn.refundAmount,
          status: saleReturn.status,
          createdAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for return approval
   */
  async approved(returnId, saleId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "sale.return.approved",
        exchange: "events_topic",
        routingKey: "sale.return.approved",
        payload: {
          returnId,
          saleId,
          companyId,
          approvedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for refund processing
   */
  async refundProcessed(returnId, saleId, companyId, refundAmount, trx = null) {
    return await Outbox.create(
      {
        type: "sale.refund.processed",
        exchange: "events_topic",
        routingKey: "sale.refund.processed",
        payload: {
          returnId,
          saleId,
          companyId,
          refundAmount,
          processedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event requesting inventory confirmation of return
   * Inventory service will confirm items are returned and update status to fully_returned
   */
  async requestInventoryConfirmation(
    returnId,
    saleId,
    companyId,
    items = [],
    trx = null
  ) {
    return await Outbox.create(
      {
        type: "sale.return.inventory.confirmation.requested",
        exchange: "events_topic",
        routingKey: "sale.return.inventory.confirmation.requested",
        payload: {
          returnId,
          saleId,
          companyId,
          items, // Array of { productId, quantity }
          requestedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },

  /**
   * Create outbox event for return fully confirmed by inventory
   * Called when inventory service confirms all items are returned
   */
  async fullyReturned(returnId, saleId, companyId, trx = null) {
    return await Outbox.create(
      {
        type: "sale.return.fully_returned",
        exchange: "events_topic",
        routingKey: "sale.return.fully_returned",
        payload: {
          returnId,
          saleId,
          companyId,
          confirmedAt: new Date().toISOString(),
          traceId: uuidv4(),
        },
      },
      trx
    );
  },
};

module.exports = {
  saleEvents,
  invoiceEvents,
  returnEvents,
};
