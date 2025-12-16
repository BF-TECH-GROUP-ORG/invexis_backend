const {
    SalesMetric,
    InventoryMetric,
    SalesItemMetric,
    Company,
    Shop,
    User
} = require("../models");
const sequelize = require("../config/database");

/**
 * IngestionController
 * Processes standardized events and writes to optimized metric tables.
 */

const IngestionController = {

    // --- SALES ---

    /**
     * Handle 'sale.created' event
     */
    async processSaleCreated(event) {
        const { data, source, emittedAt, id: sourceEventId } = event;
        const {
            companyId,
            shopId,
            totalAmount,
            items = [],
            customerId,
            paymentMethod,
        } = data;

        const transaction = await sequelize.transaction();

        try {
            // 1. Get Company Tier (for segmentation)
            let tier = "Basic";
            try {
                const company = await Company.findByPk(companyId);
                if (company) tier = company.tier;
            } catch (err) {
                console.warn(`⚠️ Ingestion: Could not fetch company tier for ${companyId}`);
            }

            const revenue = parseFloat(totalAmount || 0);

            // Calculate Total Cost
            const totalCost = items.reduce((sum, item) => {
                const qty = item.quantity || 0;
                const cost = parseFloat(item.costPrice || 0);
                return sum + (qty * cost);
            }, 0);

            const profit = revenue - totalCost;

            // Idempotency Check
            const existing = await SalesMetric.findOne({ where: { sourceEventId } });
            if (existing) {
                console.log(`⚠️ Ingestion: Duplicate SalesMetric for event ${sourceEventId} ignored.`);
                await transaction.rollback();
                return;
            }

            // 2. Record Sales Metric (High-level)
            await SalesMetric.create({
                time: emittedAt || new Date(),
                companyId,
                shopId,
                amount: revenue,
                costAmount: totalCost,
                profit: profit,
                itemCount: items.length,
                customerId: customerId || null,
                paymentMethod: paymentMethod || "unknown",
                employeeId: data.soldBy || null,
                sourceEventId,
            }, { transaction });

            // 3. Record Sales Item Metrics (Granular)
            if (items && items.length > 0) {
                const itemMetrics = items.map(item => ({
                    time: emittedAt || new Date(),
                    saleId: sourceEventId,
                    companyId,
                    shopId,
                    tier,
                    productId: item.productId,
                    productName: item.name || "Unknown Product",
                    category: item.category || "Uncategorized",
                    quantity: item.quantity || 1,
                    unitPrice: item.unitPrice || 0,
                    totalAmount: (item.quantity || 1) * (item.unitPrice || 0),
                    costPrice: item.costPrice || 0,
                    profit: ((item.quantity || 1) * (item.unitPrice || 0)) - ((item.quantity || 1) * (item.costPrice || 0))
                }));

                await SalesItemMetric.bulkCreate(itemMetrics, { transaction });
            }

            // 4. Record Inventory Metrics (Stock reduction)
            if (items && items.length > 0) {
                const inventoryRecords = items.map((item) => ({
                    time: emittedAt || new Date(),
                    companyId,
                    shopId,
                    productId: item.productId,
                    category: item.category || "Uncategorized",
                    changeAmount: -1 * Math.abs(item.quantity || 0),
                    operation: "sale",
                    sourceEventId,
                }));

                await InventoryMetric.bulkCreate(inventoryRecords, { transaction });
            }

            // Update Company Activity
            await Company.update({ lastActivity: new Date() }, { where: { id: companyId }, transaction }).catch(() => { });

            await transaction.commit();
            console.log(`📊 Ingestion: Processed Sale ${sourceEventId} (Rev: ${revenue}, Tier: ${tier})`);

        } catch (err) {
            await transaction.rollback();
            console.error("❌ Ingestion: Failed to record Sale:", err.message);
        }
    },

    // --- INVENTORY ---

    async processInventoryUpdated(event) {
        const { data, source, emittedAt, id: sourceEventId } = event;
        const { companyId, shopId, productId, newStock, change, operation } = data;

        try {
            await InventoryMetric.create({
                time: emittedAt || new Date(),
                companyId,
                shopId: shopId || null,
                productId,
                changeAmount: change || 0,
                currentStock: newStock,
                operation: operation || "update",
                sourceEventId,
            });
            console.log(`📊 Ingestion: InventoryMetric recorded for ${productId}`);
        } catch (err) {
            console.error("❌ Ingestion: Failed to record InventoryMetric:", err.message);
        }
    },

    // --- COMPANY ---

    async processCompanyCreated(event) {
        const { data, emittedAt } = event;
        // data matches company model from company-service
        try {
            await Company.create({
                id: data.id,
                name: data.name,
                tier: data.tier,
                status: data.status,
                registrationDate: data.createdAt || emittedAt,
                isActive: data.status === 'active',
                categoryIds: data.category_ids || [],
                lastActivity: new Date(),
            });
            console.log(`🏢 Ingestion: Company Created: ${data.name}`);
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') {
                // Update if exists (idempotency)
                return this.processCompanyUpdated(event);
            }
            console.error("❌ Ingestion: Company Create Failed:", err.message);
        }
    },

    async processCompanyUpdated(event) {
        const { data } = event;
        try {
            const updateData = {
                name: data.name,
                tier: data.tier,
                status: data.status,
                categoryIds: data.category_ids,
            };
            if (data.status) {
                updateData.isActive = data.status === 'active';
            }
            await Company.update(updateData, { where: { id: data.id } });
            console.log(`🏢 Ingestion: Company Updated: ${data.name}`);
        } catch (err) {
            console.error("❌ Ingestion: Company Update Failed:", err.message);
        }
    },

    // --- SHOP ---

    async processShopCreated(event) {
        const { data, emittedAt } = event;
        try {
            await Shop.create({
                id: data.id,
                companyId: data.company_id, // Note: shop-service likely uses snake_case
                name: data.name,
                createdAt: data.createdAt || emittedAt,
            });
            console.log(`🏪 Ingestion: Shop Created: ${data.name}`);
        } catch (err) {
            console.error("❌ Ingestion: Shop Create Failed:", err.message);
        }
    },

    // --- USER ---

    async processUserRegistered(event) {
        const { data, emittedAt } = event;
        try {
            await User.create({
                id: data.id,
                companyId: data.companyId || null,
                username: data.username,
                email: data.email,
                role: data.role,
                createdAt: data.createdAt || emittedAt,
            });
            console.log(`👤 Ingestion: User Registered: ${data.email}`);
        } catch (err) {
            console.error("❌ Ingestion: User Register Failed:", err.message);
        }
    }
};

module.exports = IngestionController;
