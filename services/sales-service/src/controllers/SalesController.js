const { Op, DataTypes } = require("sequelize");
const InvoicePdfService = require("../services/invoicePdf.service.js");
const knownUserService = require("../services/knownUser.service");
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
      items = [],
      paymentMethod,
    } = req.body;

    // Basic validation
    if (!companyId || !shopId || !soldBy || !knownUserId || !items.length) {
      await t.rollback();
      return res.status(400).json({
        message:
          "Missing required fields: companyId, shopId, soldBy, knownUserId, items",
      });
    }

    // Verify KnownUser exists and belongs to the company
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
        knownUserId,
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
    await saleEvents.created(sale, t);
    await invoiceEvents.created(invoice, sale, t);

    await t.commit();

    // Generate PDF asynchronously (don't block response)
    try {
      const pdfData = await InvoicePdfService.generateInvoicePdf(
        invoice.toJSON(),
        sale.toJSON(),
        saleItems.map((item) => item.toJSON()),
        { name: "INVEXIS", email: "info@invexis.com" }
      );
      // Update invoice with PDF URL
      await invoice.update({ pdfUrl: pdfData.pdfUrl });
    } catch (pdfError) {
      console.error("⚠️ Warning: PDF generation failed:", pdfError.message);
      // Don't fail the sale creation if PDF generation fails
    }

    return res.status(201).json({
      sale,
      items: saleItems,
      invoice: {
        ...invoice.toJSON(),
        pdfUrl: invoice.pdfUrl || `/invoices/pdf/${invoice.invoiceId}`,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error("createSale error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to create sale" });
  }
};

const getSale = async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await Sale.findByPk(id, {
      include: [
        { model: SalesItem, as: "items" },
        { model: SalesReturn, as: "returns" },
        { model: Invoice, as: "invoice" },
        { model: KnownUser, as: "knownUser" },
      ],
    });

    if (!sale) return res.status(404).json({ message: "Sale not found" });

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
    return res.json({ message: "Sale updated", sale });
  } catch (error) {
    console.error("updateSale error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await Sale.findByPk(id);
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    await sale.destroy(); // cascade configured on model associations will clean items/logs
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
    const where = companyId ? { companyId } : {};
    const sales = await Sale.findAll({
      where,
      include: [
        { model: SalesItem, as: "items" },
        { model: Invoice, as: "invoice" },
      ],
      order: [["createdAt", "DESC"]],
    });
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

    return res.json(report[0] || {});
  } catch (error) {
    console.error("salesReport error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const topSellingProducts = async (req, res) => {
  try {
    const { companyId, limit = 5 } = req.query;

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

    return res.json(products);
  } catch (error) {
    console.error("topSellingProducts error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const revenueTrend = async (req, res) => {
  try {
    const { companyId } = req.query;
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
  deleteSale,
  createReturn,
  listSales,
  getCustomerPurchases,
  customerSalesReport,
  salesReport,
  topSellingProducts,
  revenueTrend,
};
