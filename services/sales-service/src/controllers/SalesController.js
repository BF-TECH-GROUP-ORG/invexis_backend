const { Op, DataTypes } = require("sequelize");

const knownUserService = require("../services/knownUser.service");
const { getCache, setCache, delCache, scanDel } = require('../utils/redisHelper');
const {
  saleEvents,
  returnEvents,
} = require("../events/eventHelpers");
const { emit } = require("../events/producer");

const {
  Sale,
  SalesItem,
  SalesReturn,
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
      isDebt = false,
      isTransfer = false,
    } = req.body;

    // Basic validation
    if (!companyId || !shopId || !soldBy || !items.length) {
      await t.rollback();
      return res.status(400).json({
        message:
          "Missing required fields: companyId, shopId, soldBy, items",
      });
    }


    // Validate and normalize paymentMethod
    const validPaymentMethods = ["cash", "mtn", "airtel", "bank_transfer"];
    let normalizedPaymentMethod = paymentMethod;

    // Map common variations to valid enum values
    if (normalizedPaymentMethod) {
      const lowerMethod = String(normalizedPaymentMethod).toLowerCase();
      if (lowerMethod === "transfer") {
        normalizedPaymentMethod = "bank_transfer";
      } else if (lowerMethod === "mobile" || lowerMethod === "mobile_money") {
        normalizedPaymentMethod = "mtn"; // Default mobile to MTN
      } else if (validPaymentMethods.includes(lowerMethod)) {
        normalizedPaymentMethod = lowerMethod;
      } else {
        await t.rollback();
        return res.status(400).json({
          message: `Invalid paymentMethod. Must be one of: ${validPaymentMethods.join(", ")}`,
          received: paymentMethod,
        });
      }
    }


    // Handle KnownUser: either use provided knownUserId or create from customer data
    let finalKnownUserId = knownUserId;
    let fullKnownUser = null;

    if (!knownUserId) {
      // If no knownUserId provided, create/find from customer data
      // At minimum, we need customerName and customerPhone (email is optional)
      if (!customerName || !customerPhone) {
        await t.rollback();
        return res.status(400).json({
          message:
            "Either knownUserId or customer data (name and phone) must be provided",
        });
      }

      // Create or find KnownUser using the service (will find if exists, create if not)
      const knownUser = await knownUserService.findOrCreateKnownUser(
        {
          companyId,
          customerId,
          customerName,
          customerPhone,
          customerEmail: customerEmail || null, // Email is optional
          customerAddress,
        },
        t
      );
      finalKnownUserId = knownUser.knownUserId;
      // Store the user object for later use (e.g. hashedCustomerId, name for events)
      fullKnownUser = knownUser;
    } else {
      // If knownUserId provided, verify it exists and update its company association
      // We still use findOrCreateKnownUser to ensure company association is updated correctly
      // based on the existing user's data.
      const existingUser = await KnownUser.findByPk(knownUserId, { transaction: t });
      if (!existingUser) {
        await t.rollback();
        return res.status(404).json({
          message: "KnownUser not found",
        });
      }

      // Ensure this company is in the associatedCompanyIds
      const updatedUser = await knownUserService.findOrCreateKnownUser(
        {
          companyId,
          customerName: existingUser.customerName,
          customerPhone: existingUser.customerPhone,
          customerEmail: existingUser.customerEmail,
          customerAddress: existingUser.customerAddress,
        },
        t
      );
      finalKnownUserId = updatedUser.knownUserId;
      fullKnownUser = updatedUser;
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
        paymentMethod: normalizedPaymentMethod,
        status: "initiated",
        paymentStatus: "pending",
        isDebt,
        isTransfer,
        hashedCustomerId: fullKnownUser?.hashedCustomerId || "",
      },
      { transaction: t }
    );

    // Create SaleItems
    const saleItemsPayload = items.map((i) => ({
      saleId: sale.saleId,
      productId: i.productId,
      productName: i.productName,
      originalQuantity: i.quantity, // Store original quantity for return validation
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

    // Create outbox events within transaction (will be published by dispatcher)
    // Manually attach customer details for the event payload (since they aren't in the Sale model)
    sale.customerName = customerName || fullKnownUser?.customerName;
    sale.customerPhone = customerPhone || fullKnownUser?.customerPhone;

    await saleEvents.created(sale, saleItems, t);

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
            scanDel("known_users:*"), // Clear global user lists
          ]);
        }
      } catch (e) {
        console.error("Cache invalidation error", e);
      }
    });



    // Trigger Payment Event - Use real customer data from KnownUser
    try {
      if (['cash', 'mtn', 'airtel', 'bank_transfer'].includes(sale.paymentMethod)) {
        console.log(`📤 Triggering Payment Request for method: ${sale.paymentMethod}`);

        // Get real customer data from KnownUser
        const realCustomerName = fullKnownUser?.customerName || customerName || 'Guest User';
        const realCustomerPhone = fullKnownUser?.customerPhone || customerPhone;
        const realCustomerEmail = fullKnownUser?.customerEmail || customerEmail || 'no-email@provided.com';

        // Determine Gateway based on payment method
        let gateway = 'manual';
        let schemaPaymentMethod = 'cash';
        const method = sale.paymentMethod;

        if (method === 'cash') {
          gateway = 'cash';
          schemaPaymentMethod = 'cash';
        } else if (method === 'bank_transfer') {
          gateway = 'manual';
          schemaPaymentMethod = 'bank_transfer';
        } else if (method === 'mtn') {
          gateway = 'mtn_momo';
          schemaPaymentMethod = 'mobile_money';
        } else if (method === 'airtel') {
          gateway = 'airtel_money';
          schemaPaymentMethod = 'mobile_money';
        }

        const paymentPayload = {
          event: 'PAYMENT_REQUESTED',
          source: 'sales-service',
          paymentType: 'SALE',
          referenceId: `SALE-${sale.saleId}`,
          companyId: companyId,
          shopId: shopId,
          sellerId: soldBy,
          amount: totalAmount,
          currency: 'RWF',
          description: `Payment for Sale ${sale.saleId}`,
          paymentMethod: schemaPaymentMethod,
          gateway: gateway,
          phoneNumber: realCustomerPhone,
          customer: {
            name: realCustomerName,
            email: realCustomerEmail,
            phone: realCustomerPhone
          },
          lineItems: saleItems.map(item => ({
            id: item.productId, // meaningful ID for payment Invoice
            name: item.productName,
            qty: item.quantity,
            price: item.unitPrice
          })),
          idempotencyKey: `pay_sale_${sale.saleId}`,
          metadata: {
            saleId: sale.saleId,
            initiatedBy: soldBy,
            knownUserId: finalKnownUserId,
            isDebt: !!isDebt
          }
        };

        await emit('sales.payment.requested', paymentPayload);

        console.log("✅ Payment request event emitted");

      }

    } catch (evtError) {
      console.error("⚠️ Warning: Failed to emit background events:", evtError);
      // Don't fail the sale creation
    }

    const responseData = {
      sale: sale.toJSON ? sale.toJSON() : sale,
      items: saleItems.map((item) => (item.toJSON ? item.toJSON() : item)),
      knownUser: fullKnownUser ? (fullKnownUser.toJSON ? fullKnownUser.toJSON() : fullKnownUser) : null
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
        {
          model: SalesReturn,
          as: "returns",
          include: [
            { model: SalesReturnItem, as: "items" }
          ]
        },

        { model: KnownUser, as: "knownUser" },
      ],
    });

    if (!sale) return res.status(404).json({ message: "Sale not found" });

    // Enrich sale data with return information
    const saleData = sale.toJSON();

    // Calculate return summary if sale has returns
    if (saleData.returns && saleData.returns.length > 0) {
      const returnSummary = {
        hasReturns: true,
        totalReturns: saleData.returns.length,
        totalRefundAmount: saleData.returns.reduce((sum, ret) => sum + Number(ret.refundAmount || 0), 0),
        returnStatuses: saleData.returns.map(ret => ({
          returnId: ret.returnId,
          status: ret.status,
          refundAmount: ret.refundAmount,
          reason: ret.reason,
          createdAt: ret.createdAt
        })),
        // Calculate returned quantities per product
        returnedItems: {}
      };

      // Aggregate returned quantities by product
      saleData.returns.forEach(returnRecord => {
        if (returnRecord.items && returnRecord.items.length > 0) {
          returnRecord.items.forEach(item => {
            if (!returnSummary.returnedItems[item.productId]) {
              returnSummary.returnedItems[item.productId] = {
                productId: item.productId,
                totalReturnedQuantity: 0,
                totalRefundAmount: 0
              };
            }
            returnSummary.returnedItems[item.productId].totalReturnedQuantity += Number(item.quantity || 0);
            returnSummary.returnedItems[item.productId].totalRefundAmount += Number(item.refundAmount || 0);
          });
        }
      });

      // Convert returnedItems object to array and match with sale items
      returnSummary.returnedItems = Object.values(returnSummary.returnedItems);

      // Enrich sale items with return information
      if (saleData.items && saleData.items.length > 0) {
        saleData.items = saleData.items.map(item => {
          const returnedItem = returnSummary.returnedItems.find(ri => ri.productId === item.productId);
          return {
            ...item,
            returnedQuantity: returnedItem ? returnedItem.totalReturnedQuantity : 0,
            returnedAmount: returnedItem ? returnedItem.totalRefundAmount : 0,
            remainingQuantity: item.quantity - (returnedItem ? returnedItem.totalReturnedQuantity : 0)
          };
        });
      }

      saleData.returnSummary = returnSummary;
    } else {
      saleData.returnSummary = {
        hasReturns: false,
        totalReturns: 0,
        totalRefundAmount: 0,
        returnStatuses: [],
        returnedItems: []
      };

      // Add default return info to items
      if (saleData.items && saleData.items.length > 0) {
        saleData.items = saleData.items.map(item => ({
          ...item,
          returnedQuantity: 0,
          returnedAmount: 0,
          remainingQuantity: item.quantity
        }));
      }
    }

    // Set cache
    await setCache(cacheKey, saleData, 1800); // 30m

    return res.json(saleData);
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
      "isDebt",
      "isTransfer",
    ];
    const payload = {};

    // Validate and normalize paymentMethod if provided
    const validPaymentMethods = ["cash", "mtn", "airtel", "bank_transfer"];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "paymentMethod" && req.body[key]) {
          const lowerMethod = String(req.body[key]).toLowerCase();
          if (lowerMethod === "transfer") {
            payload[key] = "bank_transfer";
          } else if (lowerMethod === "mobile" || lowerMethod === "mobile_money") {
            payload[key] = "mtn"; // Default mobile to MTN
          } else if (!validPaymentMethods.includes(lowerMethod)) {
            return res.status(400).json({
              message: `Invalid paymentMethod. Must be one of: ${validPaymentMethods.join(", ")}`,
              received: req.body[key],
            });
          } else {
            payload[key] = req.body[key];
          }
        } else {
          payload[key] = req.body[key];
        }
      }
    }

    const sale = await Sale.findByPk(id);
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    await sale.update(payload);

    // Initialise transaction for events
    const t = await Sale.sequelize.transaction();

    try {
      // Determine what changed and emit appropriate events
      const changes = Object.keys(payload);

      if (changes.includes("status")) {
        const oldStatus = sale.previous("status") || "unknown"; // previous() might not work after reload, but we updated in place. 
        // Better: we can trust payload value is new, and fetch old before update? 
        // Actually, Sequelize instance tracks changes. But after await sale.update(), previous() might be reset if reload happens.
        // Simplified: Just emit statusChanged.
        // We know oldStatus isn't easily available without refactoring prior fetch, but we can emit event anyway.
        // Let's rely on payload.
        // Actually, we can just emit sale.updated with changes list for generic updates
        await saleEvents.statusChanged(sale.saleId, sale.companyId, "previous", payload.status, t);
      }

      if (changes.includes("paymentStatus")) {
        await saleEvents.paymentStatusChanged(sale.saleId, sale.companyId, "previous", payload.paymentStatus, t);
      }

      // Always emit generic updated event if there are changes
      if (changes.length > 0) {
        await saleEvents.updated(sale, changes, t);
      }

      await t.commit();
    } catch (err) {
      console.error("Failed to emit update events", err);
      await t.rollback();
      // Don't fail the request, just log
    }

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

    // Find the sale with items and knownUser
    const sale = await Sale.findByPk(id, {
      include: [
        { model: SalesItem, as: "items" },
        { model: KnownUser, as: "knownUser" }
      ],
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
    if (notes !== undefined) saleUpdates.notes = notes;

    // Handle KnownUser updates if any customer data is provided
    if (customerName || customerPhone || customerEmail || customerAddress || customerId) {
      // Use the knownUserService to find or create (and update) the KnownUser
      // We need to know which user to update. If the sale already has a knownUserId,
      // we should probably fetch it first if we only have partial data.

      let userData = {
        companyId: sale.companyId,
        customerName: customerName || (sale.knownUser ? sale.knownUser.customerName : undefined),
        customerPhone: customerPhone || (sale.knownUser ? sale.knownUser.customerPhone : undefined),
        customerEmail: customerEmail || (sale.knownUser ? sale.knownUser.customerEmail : undefined),
        customerAddress: customerAddress || (sale.knownUser ? sale.knownUser.customerAddress : undefined),
        customerId: customerId || (sale.knownUser ? sale.knownUser.customerId : undefined)
      };

      // If we are missing critical data but have knownUserId, we should fetch the user
      if ((!userData.customerName || !userData.customerPhone) && sale.knownUserId) {
        const existingUser = await KnownUser.findByPk(sale.knownUserId, { transaction: t });
        if (existingUser) {
          userData.customerName = userData.customerName || existingUser.customerName;
          userData.customerPhone = userData.customerPhone || existingUser.customerPhone;
          userData.customerEmail = userData.customerEmail || existingUser.customerEmail;
          userData.customerAddress = userData.customerAddress || existingUser.customerAddress;
          userData.customerId = userData.customerId || existingUser.customerId;
        }
      }

      if (userData.customerName && userData.customerPhone) {
        const updatedKnownUser = await knownUserService.findOrCreateKnownUser(userData, t);
        saleUpdates.knownUserId = updatedKnownUser.knownUserId;
        saleUpdates.hashedCustomerId = updatedKnownUser.hashedCustomerId;
      }
    }

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

    // Emit event for content update
    await saleEvents.updated(sale, ["contents_updated"], t);

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

    // Emit deleted event
    await saleEvents.deleted(sale.saleId, sale.companyId, sale.shopId);

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

    // Validate required fields
    if (!saleId) {
      await t.rollback();
      return res.status(400).json({ message: "saleId is required" });
    }

    if (!items || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: "At least one item is required for return" });
    }

    if (refundAmount <= 0) {
      await t.rollback();
      return res.status(400).json({ message: "refundAmount must be greater than 0" });
    }

    // Find the sale
    const sale = await Sale.findByPk(saleId, { transaction: t });
    if (!sale) {
      await t.rollback();
      return res.status(404).json({ message: "Sale not found" });
    }

    // Validate sale can be returned
    if (sale.status === "canceled") {
      await t.rollback();
      return res.status(400).json({ message: "Cannot return a canceled sale" });
    }

    // Validate refund amount doesn't exceed total
    if (refundAmount > Number(sale.totalAmount)) {
      await t.rollback();
      return res.status(400).json({
        message: "Refund amount cannot exceed sale total amount",
        saleTotal: sale.totalAmount,
        requestedRefund: refundAmount
      });
    }

    // Create SaleReturn record
    const saleReturn = await SalesReturn.create(
      {
        saleId: sale.saleId,
        reason: reason || "Customer requested return",
        refundAmount,
        status: "initiated",
      },
      { transaction: t }
    );

    // Insert return items
    const payload = items.map((it) => ({
      returnId: saleReturn.returnId,
      productId: it.productId,
      quantity: it.quantity,
      refundAmount: it.refundAmount || 0,
    }));

    await SalesReturnItem.bulkCreate(payload, { transaction: t });

    // Update sale items to deduct returned quantities
    for (const item of items) {
      const saleItem = await SalesItem.findOne({
        where: {
          saleId: sale.saleId,
          productId: item.productId
        },
        transaction: t
      });

      if (saleItem) {
        // Use originalQuantity if available, otherwise use current quantity (for backward compatibility)
        const originalQty = Number(saleItem.originalQuantity || saleItem.quantity);
        const currentQuantity = Number(saleItem.quantity);
        const currentReturnedQty = Number(saleItem.returnedQuantity || 0);
        const returnQty = Number(item.quantity);
        const newReturnedQty = currentReturnedQty + returnQty;

        // Validate that returned quantity doesn't exceed ORIGINAL sold quantity
        if (newReturnedQty > originalQty) {
          throw new Error(
            `Cannot return ${returnQty} units of product ${item.productId}. ` +
            `Originally sold ${originalQty} units, already returned ${currentReturnedQty} units. ` +
            `Only ${originalQty - currentReturnedQty} units available for return.`
          );
        }

        // Deduct the returned quantity from the current sale item quantity
        const newQuantity = currentQuantity - returnQty;

        // Set originalQuantity if not already set (for existing sales)
        const updates = {
          quantity: newQuantity,
          returnedQuantity: newReturnedQty
        };

        if (!saleItem.originalQuantity) {
          updates.originalQuantity = currentQuantity + returnQty; // Reconstruct original
        }

        // Update quantity, returnedQuantity, and originalQuantity
        await saleItem.update(updates, { transaction: t });

        console.log(
          `✅ Updated sale item ${saleItem.saleItemId}: ` +
          `originalQty: ${originalQty}, ` +
          `quantity ${currentQuantity} → ${newQuantity}, ` +
          `returnedQuantity ${currentReturnedQty} → ${newReturnedQty}`
        );
      } else {
        throw new Error(`Sale item not found for product ${item.productId} in sale ${sale.saleId}`);
      }
    }

    // Calculate new sale totals after deducting returned items
    const currentTotalAmount = Number(sale.totalAmount);
    const newTotalAmount = currentTotalAmount - Number(refundAmount);

    console.log(`💰 Updating sale totals: ${currentTotalAmount} - ${refundAmount} = ${newTotalAmount}`);

    // Mark the sale as returned and update totals immediately
    await sale.update({
      isReturned: true,
      paymentStatus: "refunded", // Update payment status immediately
      totalAmount: newTotalAmount, // Deduct refund amount from total
      subTotal: newTotalAmount // Also update subtotal
    }, { transaction: t });

    // Update return status to fully_returned immediately
    await saleReturn.update({
      status: "fully_returned",
      confirmedAt: new Date()
    }, { transaction: t });

    console.log(`✅ Sale ${saleId} marked as returned and refunded`);
    console.log(`✅ Sale total updated: ${currentTotalAmount} → ${newTotalAmount}`);
    console.log(`✅ Return ${saleReturn.returnId} marked as fully_returned`);

    // Publish event to inventory service to restore stock
    // This is fire-and-forget - no confirmation needed
    console.log(`📤 Publishing sale.return.restore_stock event for return ${saleReturn.returnId}`, {
      returnId: saleReturn.returnId,
      saleId: saleReturn.saleId,
      companyId: sale.companyId,
      shopId: sale.shopId,
      itemsCount: items.length,
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity }))
    });

    await returnEvents.restoreStock(
      saleReturn.returnId,
      saleReturn.saleId,
      sale.companyId,
      sale.shopId,
      items,
      t
    );

    // Publish event for analytics (financial tracking)
    await returnEvents.created(
      saleReturn,
      sale,
      items,
      t
    );

    await t.commit();

    console.log(`✅ Return ${saleReturn.returnId} created for sale ${saleId}`);
    console.log(`✅ Sale items updated with returned quantities`);
    console.log(`✅ Event published to restore inventory stock`);

    // Invalidate cache for this sale and company sales list
    setImmediate(async () => {
      await delCache(`sale:${saleId}`);
      if (sale.companyId) {
        await scanDel(`sales:list:${sale.companyId}*`);
        await scanDel(`sales:report:${sale.companyId}*`);
      }
      console.log(`🗑️ Cache invalidated for sale ${saleId} and company ${sale.companyId}`);
    });

    return res.status(201).json({
      success: true,
      saleReturn: {
        returnId: saleReturn.returnId,
        saleId: saleReturn.saleId,
        reason: saleReturn.reason,
        refundAmount: saleReturn.refundAmount,
        status: saleReturn.status,
        createdAt: saleReturn.createdAt
      },
      sale: {
        saleId: sale.saleId,
        totalAmount: sale.totalAmount,
        paymentStatus: sale.paymentStatus,
        status: sale.status,
        isReturned: sale.isReturned
      },
      message: "Return created successfully. Stock will be restored in inventory.",
    });
  } catch (error) {
    await t.rollback();
    console.error("createReturn error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create return",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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

        {
          model: SalesReturn,
          as: "returns",
          include: [
            { model: SalesReturnItem, as: "items" }
          ]
        },
        { model: KnownUser, as: "knownUser" },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Enrich sales data with return information
    const enrichedSales = sales.map(sale => {
      const saleData = sale.toJSON();

      // Calculate return summary if sale has returns
      if (saleData.returns && saleData.returns.length > 0) {
        const returnSummary = {
          hasReturns: true,
          totalReturns: saleData.returns.length,
          totalRefundAmount: saleData.returns.reduce((sum, ret) => sum + Number(ret.refundAmount || 0), 0),
          returnStatuses: saleData.returns.map(ret => ({
            returnId: ret.returnId,
            status: ret.status,
            refundAmount: ret.refundAmount,
            reason: ret.reason,
            createdAt: ret.createdAt
          })),
          // Calculate returned quantities per product
          returnedItems: {}
        };

        // Aggregate returned quantities by product
        saleData.returns.forEach(returnRecord => {
          if (returnRecord.items && returnRecord.items.length > 0) {
            returnRecord.items.forEach(item => {
              if (!returnSummary.returnedItems[item.productId]) {
                returnSummary.returnedItems[item.productId] = {
                  productId: item.productId,
                  totalReturnedQuantity: 0,
                  totalRefundAmount: 0
                };
              }
              returnSummary.returnedItems[item.productId].totalReturnedQuantity += Number(item.quantity || 0);
              returnSummary.returnedItems[item.productId].totalRefundAmount += Number(item.refundAmount || 0);
            });
          }
        });

        // Convert returnedItems object to array
        returnSummary.returnedItems = Object.values(returnSummary.returnedItems);

        saleData.returnSummary = returnSummary;
      } else {
        saleData.returnSummary = {
          hasReturns: false,
          totalReturns: 0,
          totalRefundAmount: 0,
          returnStatuses: [],
          returnedItems: []
        };
      }

      return saleData;
    });

    if (companyId) {
      await setCache(`sales:list:${companyId}`, enrichedSales, 300); // 5m
    }

    return res.json(enrichedSales);
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

        { model: KnownUser, as: "knownUser" },
        {
          model: SalesReturn,
          as: "returns",
          include: [
            { model: SalesReturnItem, as: "items" }
          ]
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Enrich sales data with return information
    const enrichedSales = sales.map(sale => {
      const saleData = sale.toJSON();

      // Calculate return summary if sale has returns
      if (saleData.returns && saleData.returns.length > 0) {
        const returnSummary = {
          hasReturns: true,
          totalReturns: saleData.returns.length,
          totalRefundAmount: saleData.returns.reduce((sum, ret) => sum + Number(ret.refundAmount || 0), 0),
          returnedItems: {}
        };

        // Aggregate returned quantities by product
        saleData.returns.forEach(returnRecord => {
          if (returnRecord.items && returnRecord.items.length > 0) {
            returnRecord.items.forEach(item => {
              if (!returnSummary.returnedItems[item.productId]) {
                returnSummary.returnedItems[item.productId] = {
                  productId: item.productId,
                  totalReturnedQuantity: 0
                };
              }
              returnSummary.returnedItems[item.productId].totalReturnedQuantity += Number(item.quantity || 0);
            });
          }
        });

        returnSummary.returnedItems = Object.values(returnSummary.returnedItems);
        saleData.returnSummary = returnSummary;
      } else {
        saleData.returnSummary = {
          hasReturns: false,
          totalReturns: 0,
          totalRefundAmount: 0,
          returnedItems: []
        };
      }

      return saleData;
    });

    return res.json(enrichedSales);
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

    const result = report[0]?.toJSON() || { totalSales: 0, totalRevenue: 0 };

    // Convert aggregate sums to major units if they came back as raw numbers
    if (result.totalRevenue) result.totalRevenue = Money.toMajor(result.totalRevenue);

    return res.json(result);
  } catch (error) {
    console.error("customerSalesReport error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const salesReport = async (req, res) => {
  try {
    const { startDate, endDate, companyId } = req.query || req.body || req.params;

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

    const result = report[0]?.toJSON() || {};

    // Convert aggregate sums to major units
    if (result.totalRevenue) result.totalRevenue = Money.toMajor(result.totalRevenue);
    if (result.totalTax) result.totalTax = Money.toMajor(result.totalTax);
    if (result.totalDiscount) result.totalDiscount = Money.toMajor(result.totalDiscount);

    await setCache(cacheKey, result, 600); // 10m

    return res.json(result);
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

    const enrichedTrend = trend.map(t => {
      const data = t.toJSON();
      return {
        month: data.month,
        revenue: Money.toMajor(data.revenue)
      };
    });

    await setCache(cacheKey, enrichedTrend, 3600); // 1h

    return res.json(enrichedTrend);
  } catch (error) {
    console.error("revenueTrend error:", error);
    return res.status(500).json({ error: error.message });
  }
};

const getSalesBySoldBy = async (req, res) => {
  try {
    const { soldBy, companyId, page = 1, limit = 20, startDate, endDate } = req.query;

    if (!soldBy) return res.status(400).json({ message: 'soldBy (user id) is required' });
    if (!companyId) return res.status(400).json({ message: 'companyId is required' });

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const perPage = Math.min(parseInt(limit) || 20, 200);
    const offset = (pageNum - 1) * perPage;

    const where = { soldBy, companyId };
    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      where.createdAt = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      where.createdAt = { [Op.lte]: new Date(endDate) };
    }

    const total = await Sale.count({ where });

    const sales = await Sale.findAll({
      where,
      include: [
        { model: SalesItem, as: "items" },

        {
          model: SalesReturn,
          as: "returns",
          include: [{ model: SalesReturnItem, as: "items" }],
        },
        { model: KnownUser, as: "knownUser" },
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit: perPage,
    });

    // Enrich each sale with a compact returnSummary and normalize items
    const enriched = sales.map((s) => {
      const saleData = s.toJSON();

      // Build return summary
      if (saleData.returns && saleData.returns.length > 0) {
        const returnSummary = {
          hasReturns: true,
          totalReturns: saleData.returns.length,
          totalRefundAmount: saleData.returns.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0),
          returnedItems: {},
        };

        saleData.returns.forEach((ret) => {
          if (ret.items && ret.items.length > 0) {
            ret.items.forEach((it) => {
              if (!returnSummary.returnedItems[it.productId]) {
                returnSummary.returnedItems[it.productId] = {
                  productId: it.productId,
                  totalReturnedQuantity: 0,
                  totalRefundAmount: 0,
                };
              }
              returnSummary.returnedItems[it.productId].totalReturnedQuantity += Number(it.quantity || 0);
              returnSummary.returnedItems[it.productId].totalRefundAmount += Number(it.refundAmount || 0);
            });
          }
        });

        returnSummary.returnedItems = Object.values(returnSummary.returnedItems);

        // attach to saleData
        saleData.returnSummary = returnSummary;
      } else {
        saleData.returnSummary = { hasReturns: false, totalReturns: 0, totalRefundAmount: 0, returnedItems: [] };
      }

      // Normalize items: ensure returnedQuantity/remainingQuantity present
      if (saleData.items && saleData.items.length) {
        saleData.items = saleData.items.map((item) => {
          const returned = (saleData.returnSummary.returnedItems || []).find((ri) => ri.productId === item.productId);
          const returnedQty = returned ? returned.totalReturnedQuantity : 0;
          return {
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            tax: item.tax || 0,
            total: item.total,
            returnedQuantity: returnedQty,
            remainingQuantity: Number(item.quantity) - Number(returnedQty || 0),
          };
        });
      }

      // Return a compact, clean representation
      return {
        saleId: saleData.saleId,
        companyId: saleData.companyId,
        shopId: saleData.shopId,
        soldBy: saleData.soldBy,
        totalAmount: saleData.totalAmount,
        paymentMethod: saleData.paymentMethod,
        paymentStatus: saleData.paymentStatus,
        status: saleData.status,
        createdAt: saleData.createdAt,
        items: saleData.items || [],
        invoice: saleData.invoice || null,
        knownUser: saleData.knownUser || null,
        returnSummary: saleData.returnSummary,
      };
    });

    return res.json({
      success: true,
      data: enriched,
      pagination: {
        page: pageNum,
        limit: perPage,
        total,
        pages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    console.error("getSalesBySoldBy error:", error);
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
  getSalesBySoldBy,
  customerSalesReport,
  salesReport,
  topSellingProducts,
  revenueTrend,
};
