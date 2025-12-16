const { Op, DataTypes } = require("sequelize");
const InvoicePdfService = require("../services/invoicePdf.service.js");
const knownUserService = require("../services/knownUser.service");
const { getCache, setCache, delCache, scanDel } = require('../utils/redisHelper');
const {
  saleEvents,
  invoiceEvents,
  returnEvents,
} = require("../events/eventHelpers");
const {
  Sale,
  SalesItem,
  SalesReturn,
  Invoice,
  SalesReturnItem,
  KnownUser,
} = require("../models/index.model");
/*
  All handlers are arrow functions and exported via module.exports at the bottom.
*/

const createSale = async (req, res) => {
  const t = await Sale.sequelize.transaction();
  try {
    const {
      companyId,
      shopId,
      soldBy,
      saleType,
      knownUserId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      items = [],
      paymentMethod,
    } = req.body;

    // Basic validation
    if (!companyId || !shopId || !soldBy || !items.length) {
      await t.rollback();
      return res.status(400).json({
        message:
          "Missing required fields: companyId, shopId, soldBy, items",
      });
    }

    // Handle KnownUser: either use provided knownUserId or create from customer data
    let finalKnownUserId = knownUserId;

    if (!knownUserId) {
      // If no knownUserId provided, create/find from customer data
      if (!customerName || !customerPhone || !customerEmail) {
        await t.rollback();
        return res.status(400).json({
          message:
            "Either knownUserId or customer data (name, phone, email) must be provided",
        });
      }

      // Create or find KnownUser using the service (will find if exists, create if not)
      const knownUser = await knownUserService.findOrCreateKnownUser(
        {
          companyId,
          customerId,
          customerName,
          customerPhone,
          customerEmail,
          customerAddress,
        },
        t
      );
      finalKnownUserId = knownUser.knownUserId;
    } else {
      // If knownUserId provided, verify it exists and belongs to the company
      const knownUser = await KnownUser.findByPk(knownUserId, { transaction: t });
      if (!knownUser) {
        await t.rollback();
        return res.status(404).json({
          message: "KnownUser not found",
        });
      }

      if (knownUser.companyId !== companyId) {
        await t.rollback();
        return res.status(403).json({
          message: "KnownUser does not belong to this company",
        });
      }
    }

    // Calculate totals
    let subTotal = 0,
      discountTotal = 0,
      taxTotal = 0;
    items.forEach((i) => {
      const qty = Number(i.quantity || 0);
      const unit = Number(i.unitPrice || 0);
      subTotal += unit * qty;
      discountTotal += Number(i.discount || 0);
      taxTotal += Number(i.tax || 0);
    });
    const totalAmount = subTotal - discountTotal + taxTotal;

    // Create Sale
    const sale = await Sale.create(
      {
        companyId,
        shopId,
        soldBy,
        saleType,
        knownUserId: finalKnownUserId,
        subTotal,
        discountTotal,
        taxTotal,
        totalAmount,
        paymentMethod,
        status: "initiated",
        paymentStatus: "pending",
      },
      { transaction: t }
    );

    // Create SaleItems
    const saleItemsPayload = items.map((i) => ({
      saleId: sale.saleId,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      costPrice: i.costPrice || 0,
      discount: i.discount || 0,
      tax: i.tax || 0,
      total:
        Number(i.unitPrice) * Number(i.quantity) -
        (i.discount || 0) +
        (i.tax || 0),
    }));

    const saleItems = await SalesItem.bulkCreate(saleItemsPayload, {
      transaction: t,
    });

    // Create Invoice (simple)
    const invoice = await Invoice.create(
      {
        saleId: sale.saleId,
        invoiceNumber: `INV-${Date.now()}`,
        subTotal,
        discountTotal,
        taxTotal,
        totalAmount,
        status: "ISSUED",
      },
      { transaction: t }
    );

    // Create outbox events within transaction (will be published by dispatcher)
    await saleEvents.created(sale, saleItems, t);
    await invoiceEvents.created(invoice, sale, t);

    await t.commit();

    // Invalidate caches (async fire-and-forget)
    setImmediate(async () => {
      try {
        if (companyId) {
          await Promise.all([
            scanDel(`sales:list:${companyId}:*`),
            scanDel(`sales:report:${companyId}:*`),
            delCache(`sales:top:${companyId}:*`),
            scanDel(`sales:trend:${companyId}:*`),
            scanDel(`sales:list:*`), // Fallback for general lists
          ]);
        }
      } catch (e) {
        console.error("Cache invalidation error", e);
      }
    });

    // Generate PDF asynchronously (don't block response)
    try {
      console.log("🎯 Attempting to generate PDF for invoice:", invoice.invoiceId);
      const pdfData = await InvoicePdfService.generateInvoicePdf(
        invoice.toJSON(),
        sale.toJSON(),
        saleItems.map((item) => item.toJSON()),
        { name: "INVEXIS", email: "info@invexis.com" }
      );
      console.log("✅ PDF generated successfully:", pdfData);
      // Update invoice with PDF URL
      await invoice.update({ pdfUrl: pdfData.pdfUrl });
      await invoice.reload(); // Reload to get the updated pdfUrl
      console.log("✅ Invoice updated with pdfUrl:", invoice.pdfUrl);
    } catch (pdfError) {
      console.error("⚠️ Warning: PDF generation failed:");
      console.error("Error message:", pdfError.message);
      console.error("Error stack:", pdfError.stack);
      // Don't fail the sale creation if PDF generation fails
    }

    const responseData = {
      sale: sale.toJSON ? sale.toJSON() : sale,
      items: saleItems.map((item) => (item.toJSON ? item.toJSON() : item)),
      invoice: {
        ...(invoice.toJSON ? invoice.toJSON() : invoice),
        pdfUrl: invoice.pdfUrl || `/invoices/pdf/${invoice.invoiceId}`,
      },
    };

    console.log(
      "✅ Response being sent:",
      JSON.stringify(responseData, null, 2)
    );

    return res.status(201).json(responseData);
  } catch (error) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error("createSale error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to create sale" });
  }
};

const getSale = async (req, res) => {
  try {
    const { id } = req.params;

    // Cache check
    const cacheKey = `sale:${id}`;
    const cachedSale = await getCache(cacheKey);
    if (cachedSale && typeof cachedSale === "object") return res.json(cachedSale);

    const sale = await Sale.findByPk(id, {
      include: [
        { model: SalesItem, as: "items" },
        { model: SalesReturn, as: "returns" },
        { model: Invoice, as: "invoice" },
        { model: KnownUser, as: "knownUser" },
      ],
    });

    if (!sale) return res.status(404).json({ message: "Sale not found" });

    // Set cache
    await setCache(cacheKey, sale.toJSON(), 1800); // 30m

    return res.json(sale);
  } catch (error) {
    console.error("getSale error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const updateSale = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      "status",
      "paymentStatus",
      "paymentMethod",
      "soldBy",
    ];
    const payload = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }

    const sale = await Sale.findByPk(id);
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    await sale.update(payload);

    // Invalidate
    setImmediate(async () => {
      await delCache(`sale:${id}`);
      if (sale.companyId) {
        await scanDel(`sales:list:${sale.companyId}:*`);
        await scanDel(`sales:report:${sale.companyId}:*`);
      }
    });

    return res.json({ message: "Sale updated", sale: sale.toJSON() });
  } catch (error) {
    console.error("updateSale error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Update sale contents (customer info, items, amounts)
 * Handles adding, updating, and removing sale items
 */
const updateSaleContents = async (req, res) => {
  const t = await Sale.sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      items = [],
      notes
    } = req.body;

    // Find the sale with items
    const sale = await Sale.findByPk(id, {
      include: [{ model: SalesItem, as: "items" }],
      transaction: t
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: "Sale not found" });
    }

    // Only allow updating if sale is in draft or initiated status
    if (!['draft', 'initiated'].includes(sale.status)) {
      await t.rollback();
      return res.status(400).json({
        message: "Cannot update sale contents after it has been confirmed"
      });
    }

    // Update sale basic info
    const saleUpdates = {};
    if (customerId !== undefined) saleUpdates.customerId = customerId;
    if (customerName !== undefined) saleUpdates.customerName = customerName;
    if (customerEmail !== undefined) saleUpdates.customerEmail = customerEmail;
    if (customerPhone !== undefined) saleUpdates.customerPhone = customerPhone;
    if (notes !== undefined) saleUpdates.notes = notes;

    if (Object.keys(saleUpdates).length > 0) {
      await sale.update(saleUpdates, { transaction: t });
    }

    // Handle items if provided
    if (items && items.length > 0) {
      // Validate items first
      for (const item of items) {
        if (!item.productId) {
          if (!t.finished) await t.rollback();
          return res.status(400).json({
            error: 'Each item must have a productId'
          });
        }
        if (!item.productName) {
          if (!t.finished) await t.rollback();
          return res.status(400).json({
            error: 'Each item must have a productName'
          });
        }
        if (!item.quantity || item.quantity <= 0) {
          if (!t.finished) await t.rollback();
          return res.status(400).json({
            error: 'Each item must have a valid quantity'
          });
        }
        if (item.unitPrice === undefined || item.unitPrice === null) {
          if (!t.finished) await t.rollback();
          return res.status(400).json({
            error: 'Each item must have a unitPrice'
          });
        }
        if (item.total === undefined || item.total === null) {
          if (!t.finished) await t.rollback();
          return res.status(400).json({
            error: 'Each item must have a total'
          });
        }
      }

      // Get existing item IDs
      const existingItemIds = sale.items.map(item => item.saleItemId);
      const updatedItemIds = items
        .filter(item => item.saleItemId)
        .map(item => item.saleItemId);

      // Delete items that are no longer in the list
      const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
      if (itemsToDelete.length > 0) {
        await SalesItem.destroy({
          where: { saleItemId: itemsToDelete },
          transaction: t
        });
      }

      // Process each item (update existing or create new)
      for (const item of items) {
        const itemData = {
          saleId: sale.saleId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice || 0,
          category: item.category || "Uncategorized",
          discount: item.discount || 0,
          tax: item.tax || 0,
          total: item.total
        };

        if (item.saleItemId) {
          // Update existing item
          await SalesItem.update(itemData, {
            where: { saleItemId: item.saleItemId },
            transaction: t
          });
        } else {
          // Create new item
          await SalesItem.create(itemData, { transaction: t });
        }
      }

      // Recalculate sale totals
      const updatedItems = await SalesItem.findAll({
        where: { saleId: sale.saleId },
        transaction: t
      });

      const subTotal = updatedItems.reduce((sum, item) =>
        sum + parseFloat(item.unitPrice) * item.quantity, 0
      );
      const discountTotal = updatedItems.reduce((sum, item) =>
        sum + parseFloat(item.discount || 0), 0
      );
      const taxTotal = updatedItems.reduce((sum, item) =>
        sum + parseFloat(item.tax || 0), 0
      );
      const totalAmount = subTotal - discountTotal + taxTotal;

      await sale.update({
        subTotal,
        discountTotal,
        taxTotal,
        totalAmount
      }, { transaction: t });
    }

    await t.commit();

    // Invalidate
    setImmediate(async () => {
      await delCache(`sale:${id}`);
      if (sale && sale.companyId) {
        await scanDel(`sales:list:${sale.companyId}:*`);
        await scanDel(`sales:report:${sale.companyId}:*`);
      }
    });

    // Fetch updated sale with items
    const updatedSale = await Sale.findByPk(id, {
      include: [{ model: SalesItem, as: "items" }]
    });

    return res.json({
      message: "Sale contents updated successfully",
      sale: updatedSale.toJSON()
    });

  } catch (error) {
    // Only rollback if transaction hasn't been rolled back or committed yet
    if (!t.finished) {
      await t.rollback();
    }
    console.error("updateSaleContents error:", error);
    return res.status(500).json({ error: error.message });
  }
};


const deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await Sale.findByPk(id);
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    const companyId = sale.companyId;

    await sale.destroy(); // cascade configured on model associations will clean items/logs

    // Invalidate
    setImmediate(async () => {
      await delCache(`sale:${id}`);
      if (companyId) {
        await scanDel(`sales:list:${companyId}:*`);
        await scanDel(`sales:report:${companyId}:*`);
      }
    });

    return res.json({ message: "Sale deleted" });
  } catch (error) {
    console.error("deleteSale error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const createReturn = async (req, res) => {
  const t = await Sale.sequelize.transaction();
  try {
    const { saleId, reason, items = [], refundAmount = 0 } = req.body;
    if (!saleId) {
      await t.rollback();
      return res.status(400).json({ message: "saleId is required" });
    }

    const sale = await Sale.findByPk(saleId);
    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: "Sale not found" });
    }

    // Create SaleReturn record
    const saleReturn = await SalesReturn.create(
      {
        saleId: sale.saleId,
        reason,
        refundAmount,
        status: "initiated",
      },
      { transaction: t }
    );

    // Insert return items if any
    if (items.length) {
      const payload = items.map((it) => ({
        returnId: saleReturn.id,
        productId: it.productId,
        quantity: it.quantity,
        refundAmount: it.refundAmount || 0,
      }));
      (await SalesReturnItem.bulkCreate)
        ? await SalesReturnItem.bulkCreate(payload, { transaction: t }) // defensive: if model supports
        : null;
    }

    // Update Sale paymentStatus if full refund (simple heuristic)
    if (refundAmount >= Number(sale.totalAmount || 0)) {
      await sale.update(
        { paymentStatus: "partially_returned" },
        { transaction: t }
      );
    }

    // Create outbox events within transaction (will be published by dispatcher)
    await returnEvents.created(saleReturn, sale, t);

    // Request inventory service to confirm return and update status to fully_returned
    // Inventory service will listen for this event and confirm items are returned
    await returnEvents.requestInventoryConfirmation(
      saleReturn.id,
      saleReturn.saleId,
      sale.companyId,
      items, // Pass items to inventory for confirmation
      t
    );

    await t.commit();
    return res.status(201).json({
      saleReturn,
      updatedSale: sale,
      message: "Return initiated. Awaiting inventory confirmation.",
    });
  } catch (error) {
    await t.rollback();
    console.error("createReturn error:", error);
    return res.status(500).json({ error: error || "Failed to create return" });
  }
};

const listSales = async (req, res) => {
  try {
    const { companyId } = req.query;

    if (companyId) {
      const cacheKey = `sales:list:${companyId}`; // In reality should include pagination bits in key
      const cached = await getCache(cacheKey);
      if (cached) return res.json(cached);
    }

    const where = companyId ? { companyId } : {};
    const sales = await Sale.findAll({
      where,
      include: [
        { model: SalesItem, as: "items" },
        { model: Invoice, as: "invoice" },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (companyId) {
      await setCache(`sales:list:${companyId}`, sales, 300); // 5m
    }

    return res.json(sales);
  } catch (error) {
    console.error("listSales error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const getCustomerPurchases = async (req, res) => {
  try {
    const { knownUserId } = req.params;
    const sales = await Sale.findAll({
      where: { knownUserId },
      include: [
        { model: SalesItem, as: "items" },
        { model: Invoice, as: "invoice" },
        { model: KnownUser, as: "knownUser" },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.json(sales);
  } catch (error) {
    console.error("getCustomerPurchases error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const customerSalesReport = async (req, res) => {
  try {
    const { knownUserId } = req.params;
    const { startDate, endDate } = req.query;
    const where = { knownUserId };

    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    const report = await Sale.findAll({
      where,
      attributes: [
        [
          Sale.sequelize.fn("COUNT", Sale.sequelize.col("saleId")),
          "totalSales",
        ],
        [
          Sale.sequelize.fn("SUM", Sale.sequelize.col("totalAmount")),
          "totalRevenue",
        ],
      ],
    });

    return res.json(report[0] || { totalSales: 0, totalRevenue: 0 });
  } catch (error) {
    console.error("customerSalesReport error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const salesReport = async (req, res) => {
  try {
    const { startDate, endDate, companyId } = req.query;

    const cacheKey = `sales:report:${companyId}:${startDate}:${endDate}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const where = {};
    if (companyId) where.companyId = companyId;
    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    const report = await Sale.findAll({
      where,
      attributes: [
        [
          Sale.sequelize.fn("COUNT", Sale.sequelize.col("saleId")),
          "totalSales",
        ],
        [
          Sale.sequelize.fn("SUM", Sale.sequelize.col("totalAmount")),
          "totalRevenue",
        ],
        [Sale.sequelize.fn("SUM", Sale.sequelize.col("taxTotal")), "totalTax"],
        [
          Sale.sequelize.fn("SUM", Sale.sequelize.col("discountTotal")),
          "totalDiscount",
        ],
      ],
    });

    await setCache(cacheKey, report[0] || {}, 600); // 10m

    return res.json(report[0] || {});
  } catch (error) {
    console.error("salesReport error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const topSellingProducts = async (req, res) => {
  try {
    const { companyId, limit = 5 } = req.query;

    const cacheKey = `sales:top:${companyId}:${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const products = await SalesItem.findAll({
      include: [
        {
          model: Sale,
          as: "sale",
          where: companyId ? { companyId } : {},
          attributes: [], // Don't select any columns from Sale to avoid GROUP BY issues
        },
      ],
      attributes: [
        "productId",
        "productName",
        [
          SalesItem.sequelize.fn("SUM", SalesItem.sequelize.col("quantity")),
          "totalSold",
        ],
      ],
      group: ["productId", "productName"],
      order: [[SalesItem.sequelize.literal("totalSold"), "DESC"]],
      limit: parseInt(limit),
      raw: true, // Return plain objects instead of model instances
    });

    await setCache(cacheKey, products, 3600); // 1h

    return res.json(products);
  } catch (error) {
    console.error("topSellingProducts error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const revenueTrend = async (req, res) => {
  try {
    const { companyId } = req.query;

    const cacheKey = `sales:trend:${companyId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const where = companyId ? { companyId } : {};

    const trend = await Sale.findAll({
      where,
      attributes: [
        [
          Sale.sequelize.fn(
            "DATE_FORMAT",
            Sale.sequelize.col("createdAt"),
            "%Y-%m"
          ),
          "month",
        ],
        [
          Sale.sequelize.fn("SUM", Sale.sequelize.col("totalAmount")),
          "revenue",
        ],
      ],
      group: ["month"],
      order: [[Sale.sequelize.literal("month"), "ASC"]],
    });

    await setCache(cacheKey, trend, 3600); // 1h

    return res.json(trend);
  } catch (error) {
    console.error("revenueTrend error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Export all handlers at the bottom as requested
module.exports = {
  createSale,
  getSale,
  updateSale,
  updateSaleContents,
  deleteSale,
  createReturn,
  listSales,
  getCustomerPurchases,
  customerSalesReport,
  salesReport,
  topSellingProducts,
  revenueTrend,
};
