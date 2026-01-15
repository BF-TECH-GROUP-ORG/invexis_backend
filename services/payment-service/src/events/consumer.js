/**
 * Payment Service Event Consumer
 * Handles payment requests and company configuration updates
 */

const { subscribe } = require('/app/shared/rabbitmq');
const paymentService = require('../services/paymentService');
const companyRepository = require('../repositories/companyRepository');
const { getLogger } = require('/app/shared/logger');
const { v4: uuidv4 } = require('uuid');

const logger = getLogger('payment-consumer');

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
        const paymentData = {
            type: effectiveType,
            reference_id: referenceId,
            company_id: effectiveCompanyId,
            shop_id: shopId || null,
            amount: effectiveAmount,
            currency: currency || 'RWF',
            method: effectiveMethod, // CARD | MOBILE_MONEY
            gateway: content.gateway || 'mtn_momo', // Default to MTN MoMo, Stripe is disabled
            gateway_token: paymentToken, // pm_xxx for Stripe
            phoneNumber: phoneNumber, // ⚡ CRITICAL: Pass top-level phone for gateway
            customer: {
                name: initiatedBy?.name || null,
                phone: phoneNumber || null
            },
            idempotency_key: idempotencyKey || `${source || 'service'}-${referenceId}`,
            metadata: { source, originalEvent: content, initiatedBy }
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

/**
 * Handle Company settings sync events
 */
const handleCompanyEvent = async (rawContent, routingKey) => {
    const content = unwrapEvent(rawContent);
    logger.info(`Received company event: ${routingKey}`, { content });

    try {
        let {
            id,
            companyId,
            name,
            country,
            payment_phones = [],
            paymentProfile = {},
            metadata = {},
            updatedAt,
            createdAt
        } = content;

        // ⚡ EDGE CASE: Handle stringified JSON fields from DB returning objects
        const parseJson = (val, defaultVal) => {
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch (e) { return defaultVal; }
            }
            return val || defaultVal;
        };

        payment_phones = parseJson(payment_phones, []);
        paymentProfile = parseJson(paymentProfile, {});
        metadata = parseJson(metadata, {});

        // ⚡ FIX: Only use companyId/id from the UNWRAPPED data 
        // (Avoiding the envelope 'id' which is a timestamp-string)
        const targetId = companyId || id;
        const eventTime = updatedAt || createdAt || new Date().toISOString();

        if (!targetId || targetId.length < 30) { // Naive UUID check
            logger.warn('Company event missing valid targetId', { targetId, content });
            return;
        }

        if (routingKey.endsWith('.deleted')) {
            await companyRepository.deleteCompanySettings(targetId);
            logger.info('Company settings deleted', { companyId: targetId });
        } else {
            // created or updated
            // ⚡ EDGE CASE: Handle Out-of-Order Events
            const existing = await companyRepository.getCompanySettings(targetId);
            if (existing && existing.metadata && existing.metadata.event_time) {
                if (new Date(eventTime) < new Date(existing.metadata.event_time)) {
                    logger.info('Skipping stale company event (older timestamp)', {
                        companyId: targetId,
                        eventTime,
                        existingTime: existing.metadata.event_time
                    });
                    return;
                }
            }

            // Extract phones from payment_phones array
            const clean = (p) => p ? p.replace(/[^0-9]/g, '') : null;
            const mtnPhone = clean(payment_phones.find(p => (p.provider === 'MTN' || p.provider === 'MTN_MOMO') && (p.enabled || p.enabled === undefined))?.phoneNumber);
            const airtelPhone = clean(payment_phones.find(p => (p.provider === 'Airtel' || p.provider === 'AIRTEL_MONEY') && (p.enabled || p.enabled === undefined))?.phoneNumber);
            const mpesaPhone = null; // M-Pesa disabled in this setup

            // Robust Stripe Connect ID extraction
            const stripeAccountId = null; // Stripe disabled in this setup

            // Extract company details for invoice generation
            const company_name = name || content.data?.name;
            const company_email = content.email || content.data?.email;
            const company_phone = content.phone || content.data?.phone || content.contacts?.[0]?.phone;
            // Address might be a string or object
            let company_address = content.address || content.data?.address;
            if (typeof company_address === 'object') company_address = JSON.stringify(company_address);

            await companyRepository.upsertCompanySettings({
                company_id: targetId,
                momo_phone: mtnPhone,
                airtel_phone: airtelPhone,
                mpesa_phone: mpesaPhone,
                stripe_account_id: stripeAccountId,
                company_name,
                company_email,
                company_phone,
                company_address,
                metadata: {
                    ...metadata,
                    country: country,
                    synced_at: new Date().toISOString(),
                    event_time: eventTime
                }
            });

            const eventType = routingKey.split('.').pop();
            logger.info(`Company settings synchronized (${eventType})`, {
                companyId: targetId,
                momo_phone: mtnPhone,
                airtel_phone: airtelPhone,
                mpesa_phone: mpesaPhone,
                stripe_account_id: stripeAccountId,
                company_name
            });
        }
    } catch (error) {
        logger.error(`Failed to process company event: ${routingKey}`, {
            error: error.message,
            content
        });
    }
};

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

        // 1. Fetch Company Settings for Header Data
        const companySettings = await companyRepository.getCompanySettings(companyId);
        if (!companySettings) {
            logger.warn('Cannot generate Bill: Company settings not found', { companyId });
            return;
        }

        // 2. Create local Invoice record (Pending)
        const invoiceRepo = require('../repositories/invoiceRepository');
        let invoice = await invoiceRepo.getInvoiceByPaymentId(saleId); // Using saleId as reference if no payment yet

        if (!invoice) {
            const invoiceService = require('../services/invoiceService');
            invoice = await invoiceService.generateInvoice({
                payment_id: null, // No payment yet
                order_id: saleId,
                seller_id: null, // Will be filled later or use companyId
                company_id: companyId,
                amount: totalAmount,
                currency: content.currency || 'XAF',
                description: `Invoice for Sale #${saleId}`,
                status: 'pending',
                customer: {
                    name: customerName,
                    phone: customerPhone
                },
                metadata: { saleId, shopId, isManual: true }
            }, items);
        }

        // 3. Request Document Generation (Status: PENDING)
        const invoicePayload = {
            invoiceData: {
                invoiceId: invoice.invoice_id,
                invoiceNumber: invoice.invoice_number,
                issueDate: createdAt || new Date().toISOString(),
                status: 'pending',
                subTotal: totalAmount,
                totalAmount: totalAmount,
                currency: invoice.currency || 'XAF'
            },
            saleData: {
                saleId: saleId,
                customerName: customerName || 'Guest',
                customerPhone: customerPhone || 'N/A'
            },
            companyData: {
                name: companySettings.company_name || 'Business',
                email: companySettings.company_email,
                phone: companySettings.company_phone,
                address: companySettings.company_address,
                logoUrl: companySettings.metadata?.logo_url
            },
            items: items.length ? items.map(i => ({
                productName: i.productName || `Product #${i.productId}`,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.total || (i.quantity * i.unitPrice)
            })) : [
                { productName: 'General Sale', quantity: 1, unitPrice: totalAmount, total: totalAmount }
            ],
            context: {
                saleId: saleId,
                invoiceId: invoice.invoice_id
            }
        };

        const { publishPaymentEvent } = require('../events/producer');
        await publishPaymentEvent.invoiceRequested(invoicePayload);
        logger.info('Bill (Pending Invoice) requested successfully', { saleId, invoiceId: invoice.invoice_id });

    } catch (error) {
        logger.error('Failed to handle sale.created', { error: error.message, content });
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

        // 4. Company lifecycle events (for syncing settings)
        await subscribe({
            queue: 'payment.company.sync.queue',
            exchange: 'events_topic',
            pattern: 'company.#' // capture company.created, company.updated, company.creation.success etc
        }, handleCompanyEvent);

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

        // Context contains invoiceId (e.g. INV-123) but we assume the DB uses payment_id or needs a lookup
        // Ideally we stored the 'invoiceId' in metadata or matching via payment_id.
        // paymentService's handleSuccessfulPayment generates `invoiceId` as `INV-{paymentId}`. 
        // Let's assume we can match it or better, context contains the paymentId if passsed through.

        // Alternatively, update by invoice_id if we have it in the DB.
        // Wait, paymentService uses `invoiceRequested` but doesn't CREATE the invoice in DB first?
        // Let's check handleSuccessfulPayment again. It ONLY emits.
        // Ah, so payment-service DOES NOT have an invoice record yet?
        // If it doesn't, this event consumer must CREATE the record too, or UPDATE the payment with the PDF URL.

        // Let's assume we want to update the PAYMENT record with the PDF URL for simplicity, 
        // OR create the invoice record now that it's generated.
        // But ideally, paymentService should have created a placeholder invoice first?
        // Checking paymentService previously... it used to call `invoiceService.generateInvoice` which created DB record.
        // We removed that. So now we rely on Document Service.
        // But we need the invoice link in Payment Service DB for users to download.

        // STRATEGY: Update the PAYMENT record's metadata with the invoice URL.
        // The `context` from paymentService producer contained:
        // saleId = payment.metadata.saleId
        // And invoiceData.invoiceId = `INV-{paymentId}`.

        // So we can find the PAYMENT by parsing the ID or using context.
        // Let's look for payment with ID ~ invoiceId.replace('INV-', '')?
        // Risk: Context might not match.

        // BETTER: Payment Service SHOULD Create the invoice record locally BEFORE requesting PDF.
        // I will fix `paymentService.js` to create the DB record first, then emit.
        // Then this consumer updates that record.

        // For now, I'll log it. I need to fix paymentService flow first to ensure DB record exists.

        // Re-reading plan: "Refactor paymentService to emit event instead of local PDF generation".
        // It didn't explicitly say "Stop creating DB record".
        // Use `invoiceRepository` to update it.

        // Assuming we fix paymentService to create the record:
        if (context && context.paymentId) {
            const invoice = await require('../repositories/invoiceRepository').getInvoiceByPaymentId(context.paymentId);
            if (invoice) {
                await require('../repositories/invoiceRepository').updateInvoiceStatus(invoice.invoice_id, {
                    pdf_url: url
                });
                logger.info('Updated invoice PDF URL', { invoiceId: invoice.invoice_id, url });
            }
            // Also update payment metadata?
            await require('../repositories/paymentRepository').updatePaymentStatus(context.paymentId, {
                metadata: { invoice_url: url }
            });
        }

    } catch (error) {
        logger.error('Failed to handle invoice created', error);
    }
};

module.exports = { startConsumers };
