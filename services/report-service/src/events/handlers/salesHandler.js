const AggregationService = require('../../services/AggregationService');
const moment = require('moment');

/**
 * Handle 'sale.created' event
 * Payload expected: { saleId, companyId, shopId, items: [...], total, ... }
 */
module.exports = async (payload, routingKey) => {
    try {
        const { companyId, shopId, items, date, soldBy, paymentMethod, traceId } = payload;

        // 0. Idempotency Check
        const { processEventOnce } = require('../../utils/redisHelper');
        const isNew = await processEventOnce(traceId || payload.id || payload.saleId, 'report-sales');
        if (!isNew) {
            console.log(`[SalesHandler] Skipping duplicate event: ${traceId || payload.id || payload.saleId}`);
            return;
        }

        console.log(`[SalesHandler] Processing ${routingKey}: ${payload.id || payload.saleId}`);

        const saleDate = date ? new Date(date) : new Date();

        // 1. Handle Status Changes (Cancellations via Status Update)
        if (routingKey === 'sale.status.changed') {
            const newStatus = (payload.newStatus || payload.status || '').toLowerCase();
            if (newStatus === 'cancelled' || newStatus === 'deleted') {
                console.log(`[SalesHandler] Sale status changed to ${newStatus}, reversing: ${payload.saleId}`);

                // We need to fetch the transaction to get items for reversal if they aren't in payload
                const SalesTransaction = require('../../models/SalesTransaction');
                const tx = await SalesTransaction.findOne({ saleId: payload.saleId || payload.id });
                if (!tx || tx.status === 'Cancelled' || tx.status === 'Deleted') return;

                const reversalData = {
                    ...tx.toObject(),
                    netSales: tx.totalAmount, // Rough approximation if items not detailed
                    totalCosts: tx.items.reduce((sum, i) => sum + (i.qtySold * (i.costPrice || 0)), 0),
                    discount: tx.debt?.discount || 0
                };

                await AggregationService.processSaleCancellation(reversalData);
                await SalesTransaction.updateOne({ saleId: tx.saleId }, { $set: { status: newStatus.charAt(0).toUpperCase() + newStatus.slice(1) } });

                const { scanDel } = require('../../utils/redisHelper');
                scanDel(`REPORT:SALES:${companyId}*`).catch(err => { });
                return;
            }
        }

        // 2. Handle specific return routing key
        if (routingKey === 'sale.return.restore_stock') {
            await AggregationService.processSaleReturn(payload);

            const { scanDel } = require('../../utils/redisHelper');
            scanDel(`REPORT:SALES:${companyId}*`).catch(err => { });
            return;
        }

        // 3. Handle Generic Updates
        if (routingKey === 'sale.updated') {
            const SalesTransaction = require('../../models/SalesTransaction');
            const tx = await SalesTransaction.findOne({ saleId: payload.saleId || payload.id });
            if (tx) {
                await AggregationService.processSaleUpdate(payload, tx);

                const { scanDel } = require('../../utils/redisHelper');
                scanDel(`REPORT:SALES:${companyId}*`).catch(err => { });
            }
            return;
        }

        // 4. Handle specific cancel/delete routing keys
        if (routingKey === 'sale.cancelled' || routingKey === 'sale.deleted') {
            console.log(`[SalesHandler] Reversing sale: ${payload.id || payload.saleId}`);

            // Calculate totals for reversal
            const netSales = items.reduce((sum, i) => sum + ((i.quantity * (i.price || i.unitPrice)) - (i.discount || 0)), 0);
            const totalCosts = items.reduce((sum, i) => sum + (i.quantity * (i.cost || i.costPrice || 0)), 0);
            const discount = items.reduce((sum, i) => sum + (i.discount || 0), 0);

            // Revert Aggregates
            await AggregationService.processSaleCancellation({
                ...payload,
                netSales,
                totalCosts,
                discount
            });

            // Mark SalesTransaction as Cancelled/Deleted
            const SalesTransaction = require('../../models/SalesTransaction');
            await SalesTransaction.updateOne(
                { saleId: payload.id || payload.saleId },
                { $set: { status: routingKey === 'sale.cancelled' ? 'Cancelled' : 'Deleted' } }
            );

            // Invalidate Caches
            const { scanDel } = require('../../utils/redisHelper');
            Promise.all([
                scanDel(`REPORT:SALES:${companyId}*`),
                scanDel(`REPORT:INVENTORY:${companyId}*`)
            ]).catch(err => console.error("Cache invalidation error:", err));

            return;
        }

        // 2. Default: Handle 'sale.created'

        // Data Enrichment: Resolve missing product names/categories to ensure high-fidelity reports
        for (let item of items) {
            if (!item.productName || !item.category || item.productName === 'Unknown Product' || item.category === 'Uncategorized') {
                const internalServiceClient = require('../../utils/internalServiceClient');
                const productData = await internalServiceClient.getProductData(item.productId);
                if (productData) {
                    item.productName = item.productName || productData.productName;
                    item.category = item.category || productData.categoryName;
                }
            }
        }

        const netSales = items.reduce((sum, i) => sum + ((i.quantity * i.price) - (i.discount || 0)), 0);
        const totalCosts = items.reduce((sum, i) => sum + (i.quantity * (i.cost || 0)), 0);
        const discount = items.reduce((sum, i) => sum + (i.discount || 0), 0);

        await AggregationService.processSaleEvent({
            ...payload,
            date: saleDate,
            netSales,
            totalCosts,
            discount
        });

        // 3. Create Sales Transaction Record
        const SalesTransaction = require('../../models/SalesTransaction');
        const transactionItems = items.map(item => ({
            productId: item.productId,
            productName: item.productName || 'Unknown Product',
            category: item.category || 'Uncategorized',
            qtySold: item.quantity,
            returns: 0,
            netQty: item.quantity,
            unitPrice: item.price,
            totalAmount: (item.quantity * item.price),
            soldBy: soldBy || 'System'
        }));

        const isCreditSale = (paymentMethod === 'CREDIT' || paymentMethod === 'PARTIAL');
        const amountReceived = payload.amountReceived || (isCreditSale ? 0 : items.reduce((sum, i) => sum + (i.quantity * i.price), 0));
        const totalAmount = items.reduce((sum, i) => sum + (i.quantity * i.price), 0);
        const debtAmount = Math.max(0, totalAmount - amountReceived);
        const dueDate = isCreditSale ? moment(saleDate).add(30, 'days').toDate() : null;

        await SalesTransaction.create({
            companyId,
            shopId,
            date: saleDate,
            invoiceNo: payload.invoiceNo || `INV-${moment(saleDate).format('YYYY')}-${(payload.id || payload.saleId).substring(0, 6).toUpperCase()}`,
            saleId: payload.id || payload.saleId,
            customer: {
                name: payload.customerName || 'Walk-in Customer',
                type: payload.customerType || 'Retail',
                id: payload.customerId,
                phone: payload.customerPhone || 'N/A'
            },
            soldBy: soldBy || 'System',
            saleTime: moment(saleDate).format('hh:mm A'),
            items: transactionItems,
            totalAmount: totalAmount,
            paymentMethod: paymentMethod || 'CASH',
            debt: {
                isDebt: (debtAmount > 0),
                originalAmount: totalAmount,
                amountPaid: amountReceived,
                balance: debtAmount,
                dueDate: dueDate,
                lastPaymentDate: (amountReceived > 0) ? saleDate : null,
                status: (debtAmount > 0) ? 'Pending' : 'Paid'
            }
        });

        // 4. Log Payment
        if (amountReceived > 0) {
            const PaymentLog = require('../../models/PaymentLog');
            await PaymentLog.create({
                companyId,
                shopId,
                date: saleDate,
                paymentId: `PAY-${payload.id || payload.saleId}`,
                invoiceNo: payload.invoiceNo || `INV-${moment(saleDate).format('YYYY')}-${(payload.id || payload.saleId).substring(0, 6).toUpperCase()}`,
                amount: amountReceived,
                method: paymentMethod || 'CASH',
                customer: {
                    name: payload.customerName || 'Walk-in Customer',
                    phone: payload.customerPhone,
                    id: payload.customerId
                },
                receivedBy: soldBy || 'System',
                time: moment(saleDate).format('hh:mm A'),
                referenceType: 'SALE',
                referenceId: payload.id || payload.saleId,
                status: 'Completed'
            });
        }

        const { scanDel } = require('../../utils/redisHelper');
        Promise.all([
            scanDel(`REPORT:SALES:${companyId}*`),
            scanDel(`REPORT:PERF:${companyId}*`),
            scanDel(`REPORT:BI:${companyId}*`),
            scanDel(`REPORT:INVENTORY:${companyId}*`)
        ]).catch(err => console.error("Cache invalidation error:", err));

    } catch (error) {
        console.error(`[SalesHandler] Error processing sale:`, error);
        throw error; // Let RabbitMQ retry
    }
};
