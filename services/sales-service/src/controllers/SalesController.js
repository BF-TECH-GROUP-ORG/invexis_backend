
const Sale= require("../models/Sales.model.js");
const SaleItem = require("../models/SalesItem.model.js");
const SaleReturn = require("../models/Salesreturn.model.js");
const Invoice = require("../models/Invoice.model.js");
module.exports = {
  async createSale(req, res) {
    const t = await Sale.sequelize.transaction();
    try {
      const {
        companyId,
        shopId,
        soldBy,
        saleType,
        customerId,
        customerName,
        customerPhone,
        customerAddress,
        items, // array of { productId, productName, quantity, unitPrice, discount, tax }
        paymentMethod,
      } = req.body;

      // Calculate totals
      let subTotal = 0,
        discountTotal = 0,
        taxTotal = 0;
      items.forEach((i) => {
        subTotal += i.unitPrice * i.quantity;
        discountTotal += i.discount || 0;
        taxTotal += i.tax || 0;
      });
      const totalAmount = subTotal - discountTotal + taxTotal;

      // Create Sale
      const sale = await Sale.create(
        {
          companyId,
          shopId,
          soldBy,
          saleType,
          customerId,
          customerName,
          customerPhone,
          customerAddress,
          subTotal,
          discountTotal,
          taxTotal,
          totalAmount,
          paymentMethod,
          status: "initiated",
        },
        { transaction: t }
      );

      // Create SaleItems
      const saleItems = await Promise.all(
        items.map((i) =>
          SaleItem.create(
            {
              saleId: sale.saleId,
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount || 0,
              tax: i.tax || 0,
              total:
                i.unitPrice * i.quantity - (i.discount || 0) + (i.tax || 0),
            },
            { transaction: t }
          )
        )
      );

      // Create Invoice
      const invoice = await Invoice.create(
        {
          saleId: sale.saleId,
          invoiceNumber: `INV-${Date.now()}`,
          subTotal,
          discountTotal,
          taxTotal,
          totalAmount,
          status: "issued",
        },
        { transaction: t }
      );

      await t.commit();
      return res.status(201).json({ sale, saleItems, invoice });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  },

  // -----------------------
  // Get Sale with all details
  // -----------------------
  async getSale(req, res) {
    try {
      const { id } = req.params;
      const sale = await Sale.findByPk(id, {
        include: ["items", "returns", "invoice"],
      });

      if (!sale) return res.status(404).json({ message: "Sale not found" });

      return res.json(sale);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  // -----------------------
  // Create Sale Return (Refund)
  // -----------------------
  async createReturn(req, res) {
    try {
      const { saleId, reason, refundAmount } = req.body;

      const sale = await Sale.findByPk(saleId);
      if (!sale) return res.status(404).json({ message: "Sale not found" });

      // Create SaleReturn record
      const saleReturn = await SaleReturn.create({
        saleId,
        reason,
        refundAmount,
        status: "initiated",
      });

      // Update Sale paymentStatus
      await sale.update({ paymentStatus: "refunded" });

      return res.status(201).json({ saleReturn, updatedSale: sale });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  // -----------------------
  // List all Sales (company scoped)
  // -----------------------
  async listSales(req, res) {
    try {
      const { companyId } = req.query;
      const where = companyId ? { companyId } : {};
      const sales = await Sale.findAll({
        where,
        include: ["items", "invoice"],
        order: [["createdAt", "DESC"]],
      });
      return res.json(sales);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },
};
