<<<<<<< HEAD
"use strict";

const sequelize = require("../config/db");
const Sale = require("../models/Sales.model");
const SalesItem = require("../models/SalesItem.model");
const Invoice = require("../models/Invoice.model");
const { OutboxService } = require("../models/Outbox.model");
const { v4: uuidv4 } = require("uuid");

/**
 * Sales Service with Transactional Outbox Pattern
 * All database operations and event publishing happen atomically
 */
class SalesService {
  /**
   * Create a new sale (atomic + outbox-safe)
   * @param {object} saleData - Sale data
   * @param {array} items - Array of sale items
   * @param {string} actorId - User who created the sale
   */
  static async createSale(saleData, items = [], actorId = "system") {
    // Start a transaction
    const transaction = await sequelize.transaction();

    try {
      // 1. Create the sale record
      const sale = await Sale.create(
        {
          companyId: saleData.companyId,
          shopId: saleData.shopId,
          customerId: saleData.customerId,
          soldBy: actorId,
          saleType: saleData.saleType || "in_store",
          status: "initiated",
          subTotal: saleData.subTotal,
          discountTotal: saleData.discountTotal || 0,
          taxTotal: saleData.taxTotal || 0,
          totalAmount: saleData.totalAmount,
          paymentStatus: "pending",
          paymentMethod: saleData.paymentMethod,
          customerName: saleData.customerName,
          customerPhone: saleData.customerPhone,
          customerAddress: saleData.customerAddress,
          hashedCustomerId: saleData.hashedCustomerId || "",
          idebt: saleData.idebt || false,
          isTransfer: saleData.isTransfer || false,
        },
        { transaction }
      );

      // 2. Create sale items if provided
      if (items && items.length > 0) {
        for (const item of items) {
          await SalesItem.create(
            {
              saleId: sale.saleId,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              tax: item.tax || 0,
              totalPrice: item.totalPrice,
            },
            { transaction }
          );

          // Record outbox event for each item added
          await OutboxService.create(
            {
              type: "sale.item.added",
              exchange: "invexis_events",
              routingKey: "sale.item.added",
              payload: {
                saleId: sale.saleId,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                createdAt: new Date().toISOString(),
                traceId: uuidv4(),
              },
            },
            transaction
          );
        }
      }

      // 3. Record outbox event for sale creation
      await OutboxService.create(
        {
          type: "sale.created",
          exchange: "invexis_events",
          routingKey: "sale.created",
          payload: {
            saleId: sale.saleId,
            companyId: sale.companyId,
            shopId: sale.shopId,
            customerId: sale.customerId,
            totalAmount: sale.totalAmount,
            saleType: sale.saleType,
            status: sale.status,
            createdAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 4. Commit transaction
      await transaction.commit();

      console.log(`✅ Sale ${sale.saleId} created successfully`);
      return sale;
    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      console.error("❌ Error creating sale:", error.message);
      throw error;
    }
  }

  /**
   * Complete a sale (atomic + outbox-safe)
   * @param {number} saleId - Sale ID
   * @param {object} paymentData - Payment information
   */
  static async completeSale(saleId, paymentData = {}) {
    const transaction = await sequelize.transaction();

    try {
      // 1. Find the sale
      const sale = await Sale.findByPk(saleId, { transaction });
      if (!sale) {
        throw new Error("Sale not found");
      }

      // 2. Update sale status
      await sale.update(
        {
          status: "completed",
          paymentStatus: "paid",
          paymentId: paymentData.paymentId,
        },
        { transaction }
      );

      // 3. Record outbox event for sale completion
      await OutboxService.create(
        {
          type: "sale.completed",
          exchange: "invexis_events",
          routingKey: "sale.completed",
          payload: {
            saleId: sale.saleId,
            companyId: sale.companyId,
            shopId: sale.shopId,
            totalAmount: sale.totalAmount,
            paymentId: paymentData.paymentId,
            completedAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 4. Record payment completion event
      await OutboxService.create(
        {
          type: "sale.payment.completed",
          exchange: "invexis_events",
          routingKey: "sale.payment.completed",
          payload: {
            saleId: sale.saleId,
            paymentId: paymentData.paymentId,
            amount: sale.totalAmount,
            paymentMethod: sale.paymentMethod,
            paidAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 5. Commit transaction
      await transaction.commit();

      console.log(`✅ Sale ${saleId} completed successfully`);
      return sale;
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Error completing sale:", error.message);
      throw error;
    }
  }

  /**
   * Cancel a sale (atomic + outbox-safe)
   * @param {number} saleId - Sale ID
   * @param {string} reason - Cancellation reason
   * @param {string} actorId - User who canceled
   */
  static async cancelSale(saleId, reason = "Customer request", actorId = "system") {
    const transaction = await sequelize.transaction();

    try {
      // 1. Find the sale with items
      const sale = await Sale.findByPk(saleId, {
        include: [{ model: SalesItem, as: "items" }],
        transaction
      });
      if (!sale) {
        throw new Error("Sale not found");
      }

      // 2. Update sale status
      await sale.update(
        {
          status: "canceled",
          paymentStatus: "failed",
        },
        { transaction }
      );

      // 3. Get sale items for stock restoration
      const items = sale.items ? sale.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costPrice: item.costPrice
      })) : [];

      // 4. Record outbox event with items for inventory service
      await OutboxService.create(
        {
          type: "sale.cancelled",
          exchange: "events_topic",
          routingKey: "sale.cancelled",
          payload: {
            saleId: sale.saleId,
            companyId: sale.companyId,
            shopId: sale.shopId,
            soldBy: sale.soldBy,
            reason,
            canceledBy: actorId,
            items: items,
            canceledAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 5. Commit transaction
      await transaction.commit();

      console.log(`✅ Sale ${saleId} canceled successfully`);
      return sale;
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Error canceling sale:", error.message);
      throw error;
    }
  }

  /**
   * Generate invoice for a sale (atomic + outbox-safe)
   * @param {number} saleId - Sale ID
   * @param {object} invoiceData - Invoice data
   */
  static async generateInvoice(saleId, invoiceData = {}) {
    const transaction = await sequelize.transaction();

    try {
      // 1. Find the sale
      const sale = await Sale.findByPk(saleId, { transaction });
      if (!sale) {
        throw new Error("Sale not found");
      }

      // 2. Create invoice
      const invoice = await Invoice.create(
        {
          saleId: sale.saleId,
          invoiceNumber: invoiceData.invoiceNumber || `INV-${Date.now()}`,
          totalAmount: sale.totalAmount,
          status: "pending",
          ...invoiceData,
        },
        { transaction }
      );

      // 3. Record outbox event
      await OutboxService.create(
        {
          type: "invoice.created",
          exchange: "invexis_events",
          routingKey: "invoice.created",
          payload: {
            invoiceId: invoice.invoiceId,
            saleId: sale.saleId,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
            createdAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 4. Commit transaction
      await transaction.commit();

      console.log(`✅ Invoice ${invoice.invoiceNumber} generated successfully`);
      return invoice;
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Error generating invoice:", error.message);
      throw error;
    }
  }
}

module.exports = SalesService;

=======
"use strict";

const sequelize = require("../config/db");
const Sale = require("../models/Sales.model");
const SalesItem = require("../models/SalesItem.model");
const Invoice = require("../models/Invoice.model");
const { OutboxService } = require("../models/Outbox.model");
const { v4: uuidv4 } = require("uuid");

/**
 * Sales Service with Transactional Outbox Pattern
 * All database operations and event publishing happen atomically
 */
class SalesService {
  /**
   * Create a new sale (atomic + outbox-safe)
   * @param {object} saleData - Sale data
   * @param {array} items - Array of sale items
   * @param {string} actorId - User who created the sale
   */
  static async createSale(saleData, items = [], actorId = "system") {
    // Start a transaction
    const transaction = await sequelize.transaction();

    try {
      // 1. Create the sale record
      const sale = await Sale.create(
        {
          companyId: saleData.companyId,
          shopId: saleData.shopId,
          customerId: saleData.customerId,
          soldBy: actorId,
          saleType: saleData.saleType || "in_store",
          status: "initiated",
          subTotal: saleData.subTotal,
          discountTotal: saleData.discountTotal || 0,
          taxTotal: saleData.taxTotal || 0,
          totalAmount: saleData.totalAmount,
          paymentStatus: "pending",
          paymentMethod: saleData.paymentMethod,
          customerName: saleData.customerName,
          customerPhone: saleData.customerPhone,
          customerAddress: saleData.customerAddress,
        },
        { transaction }
      );

      // 2. Create sale items if provided
      if (items && items.length > 0) {
        for (const item of items) {
          await SalesItem.create(
            {
              saleId: sale.saleId,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              tax: item.tax || 0,
              totalPrice: item.totalPrice,
            },
            { transaction }
          );

          // Record outbox event for each item added
          await OutboxService.create(
            {
              type: "sale.item.added",
              exchange: "invexis_events",
              routingKey: "sale.item.added",
              payload: {
                saleId: sale.saleId,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                createdAt: new Date().toISOString(),
                traceId: uuidv4(),
              },
            },
            transaction
          );
        }
      }

      // 3. Record outbox event for sale creation
      await OutboxService.create(
        {
          type: "sale.created",
          exchange: "invexis_events",
          routingKey: "sale.created",
          payload: {
            saleId: sale.saleId,
            companyId: sale.companyId,
            shopId: sale.shopId,
            customerId: sale.customerId,
            totalAmount: sale.totalAmount,
            saleType: sale.saleType,
            status: sale.status,
            createdAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 4. Commit transaction
      await transaction.commit();

      console.log(`✅ Sale ${sale.saleId} created successfully`);
      return sale;
    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      console.error("❌ Error creating sale:", error.message);
      throw error;
    }
  }

  /**
   * Complete a sale (atomic + outbox-safe)
   * @param {number} saleId - Sale ID
   * @param {object} paymentData - Payment information
   */
  static async completeSale(saleId, paymentData = {}) {
    const transaction = await sequelize.transaction();

    try {
      // 1. Find the sale
      const sale = await Sale.findByPk(saleId, { transaction });
      if (!sale) {
        throw new Error("Sale not found");
      }

      // 2. Update sale status
      await sale.update(
        {
          status: "completed",
          paymentStatus: "paid",
          paymentId: paymentData.paymentId,
        },
        { transaction }
      );

      // 3. Record outbox event for sale completion
      await OutboxService.create(
        {
          type: "sale.completed",
          exchange: "invexis_events",
          routingKey: "sale.completed",
          payload: {
            saleId: sale.saleId,
            companyId: sale.companyId,
            shopId: sale.shopId,
            totalAmount: sale.totalAmount,
            paymentId: paymentData.paymentId,
            completedAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 4. Record payment completion event
      await OutboxService.create(
        {
          type: "sale.payment.completed",
          exchange: "invexis_events",
          routingKey: "sale.payment.completed",
          payload: {
            saleId: sale.saleId,
            paymentId: paymentData.paymentId,
            amount: sale.totalAmount,
            paymentMethod: sale.paymentMethod,
            paidAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 5. Commit transaction
      await transaction.commit();

      console.log(`✅ Sale ${saleId} completed successfully`);
      return sale;
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Error completing sale:", error.message);
      throw error;
    }
  }

  /**
   * Cancel a sale (atomic + outbox-safe)
   * @param {number} saleId - Sale ID
   * @param {string} reason - Cancellation reason
   * @param {string} actorId - User who canceled
   */
  static async cancelSale(saleId, reason = "Customer request", actorId = "system") {
    const transaction = await sequelize.transaction();

    try {
      // 1. Find the sale
      const sale = await Sale.findByPk(saleId, { transaction });
      if (!sale) {
        throw new Error("Sale not found");
      }

      // 2. Update sale status
      await sale.update(
        {
          status: "canceled",
          paymentStatus: "failed",
        },
        { transaction }
      );

      // 3. Record outbox event
      await OutboxService.create(
        {
          type: "sale.canceled",
          exchange: "invexis_events",
          routingKey: "sale.canceled",
          payload: {
            saleId: sale.saleId,
            companyId: sale.companyId,
            shopId: sale.shopId,
            reason,
            canceledBy: actorId,
            canceledAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 4. Commit transaction
      await transaction.commit();

      console.log(`✅ Sale ${saleId} canceled successfully`);
      return sale;
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Error canceling sale:", error.message);
      throw error;
    }
  }

  /**
   * Generate invoice for a sale (atomic + outbox-safe)
   * @param {number} saleId - Sale ID
   * @param {object} invoiceData - Invoice data
   */
  static async generateInvoice(saleId, invoiceData = {}) {
    const transaction = await sequelize.transaction();

    try {
      // 1. Find the sale
      const sale = await Sale.findByPk(saleId, { transaction });
      if (!sale) {
        throw new Error("Sale not found");
      }

      // 2. Create invoice
      const invoice = await Invoice.create(
        {
          saleId: sale.saleId,
          invoiceNumber: invoiceData.invoiceNumber || `INV-${Date.now()}`,
          totalAmount: sale.totalAmount,
          status: "pending",
          ...invoiceData,
        },
        { transaction }
      );

      // 3. Record outbox event
      await OutboxService.create(
        {
          type: "invoice.created",
          exchange: "invexis_events",
          routingKey: "invoice.created",
          payload: {
            invoiceId: invoice.invoiceId,
            saleId: sale.saleId,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
            createdAt: new Date().toISOString(),
            traceId: uuidv4(),
          },
        },
        transaction
      );

      // 4. Commit transaction
      await transaction.commit();

      console.log(`✅ Invoice ${invoice.invoiceNumber} generated successfully`);
      return invoice;
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Error generating invoice:", error.message);
      throw error;
    }
  }
}

module.exports = SalesService;

>>>>>>> 55eb3af5e260dabebd54e7923b37bc5096e6e6ae
