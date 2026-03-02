/**
 * Payment Service Event Consumer
 * Handles payment requests and company configuration updates
 */

const { subscribe } = require('/app/shared/rabbitmq');
const paymentService = require('../services/paymentService');
const { getLogger } = require('/app/shared/logger');

const logger = getLogger('payment-consumer');
const { getParsed } = require('../utils/jsonUtils');

/**
 * ⚡ UTILITY: Unwrap Standardized Event Envelope
 * Handles cases where payload is wrapped in { id, source, data, type } 
 * and ensures 'data' is parsed if stringified.
 */
const unwrapEvent = (content) => {
    // If it's a wrapped event from our standard publisher
    if (content && content.data && content.type) {
        let payload = content.data;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            } catch (e) {
                logger.error('Failed to parse stringified event data', { error: e.message, raw: payload });
            }
        }
        return payload;
    }
    // Otherwise return as is (legacy or direct events)
    return content;
};

/**
 * Handle PAYMENT_REQUESTED event
 */
const handlePaymentRequested = async (rawContent, routingKey) => {
    const content = unwrapEvent(rawContent);
    logger.info('Received PAYMENT_REQUESTED event', { content, routingKey });

    try {
        const {
            event,
            type: contentType, // Some events use type instead of event
            source,
            paymentType,
            referenceId,
            companyId,
            company_id, // Allow both
            amount,
            currency,
            method,
            paymentMethod, // Allow both
            paymentToken,
            stripePaymentMethodId, // For auto-renew
            phoneNumber,
            idempotencyKey,
            shopId,
            initiatedBy
        } = content;

        // Determine effective mapping
        const effectiveCompanyId = companyId || company_id;
        const effectiveMethod = method || paymentMethod || 'MOBILE_MONEY';
        const effectiveAmount = amount;
        const effectiveType = paymentType || (routingKey.includes('subscription') ? 'SUBSCRIPTION' : 'SALE');

        if (!effectiveCompanyId) {
            logger.warn('Payment request missing companyId', { content });
            return;
        }

        // Map event payload to payment service internal structure
        // Map event payload to payment service internal structure
        // (getParsed now imported from jsonUtils)

        const paymentData = {
            type: effectiveType,
            reference_id: referenceId,
            company_id: effectiveCompanyId,
            shop_id: shopId || null,
            amount: effectiveAmount,
            currency: currency || 'RWF',
            method: effectiveMethod, // CARD | MOBILE_MONEY
            // Map gateway: cash/bank_transfer -> manual, otherwise use provided gateway
            gateway: (() => {
                const rawGateway = content.gateway || content.paymentMethod || 'manual';
                if (rawGateway === 'cash' || rawGateway === 'bank_transfer') {
                    return 'manual';
                }
                return rawGateway;
            })(),
            gateway_token: paymentToken, // pm_xxx for Stripe
            phoneNumber: phoneNumber, // ⚡ CRITICAL: Pass top-level phone for gateway
            customer: getParsed(content.customer) || {
                name: content.customerName || initiatedBy?.name || null,
                phone: phoneNumber || null,
                email: content.customerEmail || null
            },
            description: content.description || `Payment for ${effectiveType} ${referenceId || 'transaction'}`,
            seller_id: content.sellerId || initiatedBy?.userId || effectiveCompanyId,
            line_items: getParsed(content.lineItems || content.line_items || []),
            idempotency_key: idempotencyKey || `${source || 'service'}-${referenceId}`,
            metadata: {
                source,
                ...getParsed(content.metadata || {}), // Preserve incoming metadata at top level
                originalEventId: content.id,
                initiatedBy,
                saleId: content.saleId || content.metadata?.saleId,
                debtId: content.debtId || content.metadata?.debtId,
                knownUserId: content.metadata?.knownUserId
            }
        };

        const initiateWithRetry = async (retryCount = 0) => {
            try {
                logger.info('Initiating payment attempt...', {
                    referenceId,
                    companyId: effectiveCompanyId,
                    attempt: retryCount + 1
                });
                await paymentService.initiatePayment(paymentData);
            } catch (error) {
                // ⚡ RACE CONDITION: If company settings aren't synced yet, wait and retry once
                if (error.message.includes('Company not found') && retryCount < 1) {
                    logger.warn('Company settings not found yet, retrying in 2 seconds...', {
                        companyId: effectiveCompanyId,
                        referenceId
                    });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return initiateWithRetry(retryCount + 1);
                }
                throw error;
            }
        };

        await initiateWithRetry();

        logger.info('Payment initiated successfully via consumer', { referenceId, companyId: effectiveCompanyId });
    } catch (error) {
        logger.error('Failed to process PAYMENT_REQUESTED', {
            error: error.message,
            content,
            routingKey
        });
        throw error;
    }
};

const internalServiceClient = require('../services/internalServiceClient');

/**
 * Handle sale.created from sales-service
 * This triggers the initial "BILL" (Pending Invoice) generation
 */
const handleSaleCreated = async (rawContent, routingKey) => {
    const content = unwrapEvent(rawContent);
    logger.info('Received sale.created event', { content });

    try {
        const {
            saleId,
            companyId,
            shopId,
            customerName,
            customerPhone,
            totalAmount,
            items = [],
            createdAt
        } = content;

        if (!companyId) {
            logger.warn('Sale event missing companyId', { content });
            return;
        }

        const processSaleWithRetry = async (retryCount = 0) => {
            try {
                // 1. Fetch Company Settings from company-service
                const companySettings = await internalServiceClient.getCompanySettings(companyId);

                if (!companySettings) {
                    if (retryCount < 3) {
                        logger.warn(`Company settings not found yet for sale ${saleId}, retrying in 2 seconds... (Attempt ${retryCount + 1}/3)`, { companyId });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return processSaleWithRetry(retryCount + 1);
                    }
                    logger.error('Cannot generate Bill: Company settings not found after retries', { companyId, saleId });
                    return;
                }

                // 2. Fetch Shop Data (to show shop name on invoice)
                const shopData = await internalServiceClient.getShopData(shopId);
                const shopName = shopData?.name ? ` - ${shopData.name}` : '';

                // 2. Create local Invoice record (Pending)
                const invoiceRepo = require('../repositories/invoiceRepository');
                let invoice = await invoiceRepo.getInvoiceBySaleId(saleId);

                if (!invoice) {
                    const invoiceService = require('../services/invoiceService');
                    invoice = await invoiceService.generateInvoice({
                        payment_id: null,
                        order_id: saleId,
                        seller_id: content.soldBy || companySettings.admin_id || companyId,
                        company_id: companyId,
                        companyData: {
                            name: companySettings.company_name || 'Business',
                            shopName: shopData?.name,
                            email: companySettings.company_email,
                        },
                        shop_id: shopId,
                        amount: totalAmount,
                        currency: content.currency || 'XAF',
                        description: `Invoice for Sale #${saleId}`,
                        status: content.isDebt ? 'debt' : 'pending',
                        customer: {
                            name: customerName,
                            phone: customerPhone
                        },
                        line_items: getParsed(items),
                        metadata: { saleId, shopId, isManual: true }
                    }, items);
                }

                // 3. (REFINED) We NO LONGER request document generation here (Pending status)
                // We only do it once payment is processed (Paid/Failed) to avoid double docs.
                logger.info('Invoice record created for pending sale, skipping doc generation until payment', { saleId, invoiceId: invoice.invoice_id });

            } catch (error) {
                logger.error('Failed to handle sale.created retry', { error: error.message, content });
                throw error; // Re-throw for parent catch
            }
        };

        await processSaleWithRetry();

    } catch (error) {
        logger.error('Critical failure in handleSaleCreated', { error: error.message, content });
    }
};

/**
 * Start all consumers for payment-service
 */
const startConsumers = async () => {
    try {
        // 0. Sales Lifecycle (for automatic Bill generation)
        await subscribe({
            queue: 'payment.sale_created.queue',
            exchange: 'events_topic',
            pattern: 'sale.created'
        }, handleSaleCreated);

        // 1. Sales Payments (Customer -> Company)
        await subscribe({
            queue: 'payment.sales.queue',
            exchange: 'events_topic',
            pattern: 'sales.payment.requested'
            // ...
        }, handlePaymentRequested);

        // 2. Debts Payments (Customer -> Company)
        await subscribe({
            queue: 'payment.debts.queue',
            exchange: 'events_topic',
            pattern: 'debts.payment.requested'
        }, handlePaymentRequested);

        // 3. Subscription/Tier Payments (Company -> Invexis)
        await subscribe({
            queue: 'payment.subscriptions.queue',
            exchange: 'events_topic',
            pattern: 'subscription.payment.requested'
        }, handlePaymentRequested);

        // 5. Document Events (Invoice Generated)
        await subscribe({
            queue: 'payment.invoice_sync.queue',
            exchange: 'events_topic',
            pattern: 'document.invoice.created'
        }, handleInvoiceCreated);

        logger.info('Payment Service consumers started successfully');
    } catch (error) {
        logger.error('Failed to start Payment Service consumers', { error: error.message });
        process.exit(1);
    }
};

/**
 * Handle document.invoice.created
 */
const handleInvoiceCreated = async (rawContent, routingKey) => {
    const content = unwrapEvent(rawContent);
    logger.info('Received document.invoice.created', { content });

    try {
        const { url, context } = content;

        if (!context || !context.paymentId) {
            logger.warn('Received document.invoice.created without paymentId in context', { content });
            return;
        }

        const { paymentId } = context;

        // 1. Update Invoice Record
        // We try to find the invoice by paymentId. 
        // Note: The invoice should have been created during the payment process.
        const invoiceRepository = require('../repositories/invoiceRepository');
        const invoice = await invoiceRepository.getInvoiceByPaymentId(paymentId);

        if (invoice) {
            await invoiceRepository.updateInvoiceStatus(invoice.invoice_id, {
                pdf_url: url
            });
            logger.info('Updated invoice PDF URL', { invoiceId: invoice.invoice_id, url });
        } else {
            logger.warn(`Invoice not found for paymentId: ${paymentId} during document sync`);
        }

        // 2. Update Payment Metadata
        // Store the invoice URL in the payment metadata for easy access
        const paymentRepository = require('../repositories/paymentRepository');
        await paymentRepository.updatePaymentStatus(paymentId, {
            metadata: { invoice_url: url }
        });

        logger.info('Updated payment metadata with invoice URL', { paymentId, url });

    } catch (error) {
        logger.error('Error handling document.invoice.created', {
            error: error.message,
            stack: error.stack
        });
    }
};

module.exports = { startConsumers };