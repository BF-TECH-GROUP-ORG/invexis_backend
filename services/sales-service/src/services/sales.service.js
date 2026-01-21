"use strict";

const sequelize = require("../config/db");
const Sale = require("../models/Sales.model");
const SalesItem = require("../models/SalesItem.model");
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
          isDebt: saleData.isDebt || false,
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
              exchange: "events_topic",
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
          exchange: "events_topic",
          routingKey: "sale.created",
          // Include debt-related metadata so debt-service can correlate and update debts reliably
          payload: {
            saleId: sale.saleId,
            companyId: sale.companyId,
            shopId: sale.shopId,
            customerId: sale.customerId,
            // Pass known hashedCustomerId if we have it (copied from KnownUser at sale creation)
            hashedCustomerId: sale.hashedCustomerId || null,
            // Flag indicating this sale may result in a debt (useful for quick routing)
            isDebt: !!saleData.isDebt,
            // Helpful customer display fields for debt-service to attach immediately
            customerName: sale.customerName || null,
            customerPhone: sale.customerPhone || null,
            totalAmount: sale.totalAmount,
            saleType: sale.saleType,
            status: sale.status,
            items: items && items.length ? items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, total: i.totalPrice })) : [],
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
          exchange: "events_topic",
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
          exchange: "events_topic",
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


}

module.exports = SalesService