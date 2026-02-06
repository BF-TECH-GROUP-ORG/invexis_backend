// src/services/paymentService.js
// Main payment service orchestrating all gateways and database operations

require('dotenv').config();
const internalServiceClient = require('./internalServiceClient');
const paymentRepository = require('../repositories/paymentRepository');
const transactionRepository = require('../repositories/transactionRepository');
const invoiceService = require('./invoiceService');
const stripeGateway = require('./gateways/stripeGateway');
const mtnMomoGateway = require('./gateways/mtnMomoGateway');
const airtelMoneyGateway = require('./gateways/airtelMoneyGateway');
const mpesaGateway = require('./gateways/mpesaGateway');
const { publishPaymentEvent } = require('../events/producer');
const { GATEWAY_TYPES, PAYMENT_STATUS, TRANSACTION_TYPE, TRANSACTION_STATUS, PAYMENT_TYPE } = require('../utils/constants');

// Optional: Redis for caching
let redis;
try {
    redis = require('/app/shared/redis');
} catch (error) {
    console.warn('Shared services (Redis) not available, continuing without it');
    redis = null;
}

class PaymentService {
    /**
     * Initiate a payment
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Payment result
     */
    async initiatePayment(rawPaymentData) {
        // 1. Smart Normalization & Aliasing
        const data = this._normalizePaymentData(rawPaymentData);

        const {
            seller_id,
            company_id,
            shop_id,
            order_id,
            amount,
            currency,
            description,
            type,
            method,
            gateway,
            phoneNumber,
            customer,
            line_items,
            metadata,
            reference_id,
            idempotency_key,
            payout_recipient_id,
            payout_details,
            location
        } = data;

        if (!Object.values(GATEWAY_TYPES).includes(gateway)) {
            throw new Error(`Unsupported gateway: ${gateway}`);
        }

        if (!amount || amount <= 0) {
            throw new Error(`Invalid payment amount: ${amount}. Amount must be greater than zero.`);
        }

        // ⚡ EDGE CASE: Idempotency Check
        const existingPayment = await paymentRepository.getPaymentByIdempotencyKey(idempotency_key);
        if (existingPayment) {
            console.log(`[IDEMPOTENCY] Found existing payment for key: ${idempotency_key}`);
            return {
                success: true,
                payment_id: existingPayment.payment_id,
                status: existingPayment.status,
                gateway_token: existingPayment.gateway_token,
                is_duplicate: true,
                message: 'Payment already initiated/processed'
            };
        }

        let payment = null;
        try {
            // 3. Create payment record in database
            payment = await paymentRepository.createPayment(data);

            // ⚡ CREATE INVOICE RECORD (REMOVED)
            // Invoice generation is now purely event-driven after successful payment
            // via document-service to avoid initial insert errors and sync bottlenecks.

            // Create initial transaction record
            const transaction = await transactionRepository.createTransaction({
                payment_id: payment.payment_id,
                seller_id,
                company_id,
                shop_id,
                type: TRANSACTION_TYPE.CHARGE,
                amount,
                currency,
                status: TRANSACTION_STATUS.PENDING,
                metadata: { gateway, initial_request: true, shop_id }
            });

            // 3. Fetch payee info if applicable
            let payee = null;
            if ([PAYMENT_TYPE.SALE, PAYMENT_TYPE.DEBT].includes(type)) {
                if (!company_id) {
                    throw new Error(`Company ID is required for payment type: ${type}`);
                }

                // ⚡ OPTIMIZATION: Skip company-service call for manual payments (Cash/Bank)
                // as they don't require automated gateway credentials (phones/stripe ids)
                if (gateway !== GATEWAY_TYPES.CASH && gateway !== GATEWAY_TYPES.MANUAL) {
                    console.log(`[PaymentService] Initiating automated payment for company: ${company_id} via ${gateway}`);
                    const settings = await internalServiceClient.getCompanySettings(company_id);

                    if (!settings) {
                        console.error(`[PaymentService] FAILED: Company settings not found for ID: ${company_id}`);
                        throw new Error(`Company settings not available for automated payment.`);
                    }

                    payee = {
                        momo_phone: settings.momo_phone,
                        airtel_phone: settings.airtel_phone,
                        mpesa_phone: settings.mpesa_phone,
                        stripe_account_id: settings.stripe_account_id,
                        name: metadata?.company_name || settings.company_name || 'Company'
                    };

                    // Validate that at least one payment method is available for the requested gateway
                    if (gateway === GATEWAY_TYPES.MTN_MOMO && !payee.momo_phone) {
                        throw new Error(`Company ${payee.name} does not support MTN_MOMO payments`);
                    }
                    if (gateway === GATEWAY_TYPES.AIRTEL_MONEY && !payee.airtel_phone) {
                        throw new Error(`Company ${payee.name} does not support AIRTEL_MONEY payments`);
                    }
                    if (gateway === GATEWAY_TYPES.MPESA && !payee.mpesa_phone) {
                        throw new Error(`Company ${payee.name} does not support MPESA payments`);
                    }
                    if (gateway === GATEWAY_TYPES.STRIPE && !payee.stripe_account_id) {
                        throw new Error(`Company ${payee.name} does not support STRIPE payments`);
                    }
                } else {
                    // For Cash/Bank, we only need the name for logging/metadata
                    payee = {
                        name: metadata?.company_name || 'Company'
                    };
                    console.log(`[PaymentService] Initiating manual payment (${gateway}) for company: ${company_id}`);
                }

            } else if ([PAYMENT_TYPE.SUBSCRIPTION, PAYMENT_TYPE.TIER].includes(type)) {
                // Validate that at least one payment method is available for the requested gateway
                const momoPhone = process.env.INVEXIS_MOMO_PHONE;
                const airtelPhone = process.env.INVEXIS_AIRTEL_PHONE;
                const mpesaPhone = process.env.INVEXIS_MPESA_PHONE;
                const stripeAccountId = process.env.INVEXIS_STRIPE_ACCOUNT_ID;

                if (gateway === GATEWAY_TYPES.MTN_MOMO && !momoPhone) {
                    throw new Error('Platform MTN MoMo phone number is not configured (INVEXIS_MOMO_PHONE).');
                }
                if (gateway === GATEWAY_TYPES.AIRTEL_MONEY && !airtelPhone) {
                    throw new Error('Platform Airtel Money phone number is not configured (INVEXIS_AIRTEL_PHONE).');
                }
                if (gateway === GATEWAY_TYPES.MPESA && !mpesaPhone) {
                    throw new Error('Platform M-Pesa phone number is not configured (INVEXIS_MPESA_PHONE).');
                }
                if (gateway === GATEWAY_TYPES.STRIPE && !stripeAccountId) {
                    throw new Error('Platform Stripe account ID is not configured (INVEXIS_STRIPE_ACCOUNT_ID).');
                }

                payee = {
                    momo_phone: momoPhone,
                    airtel_phone: airtelPhone,
                    mpesa_phone: mpesaPhone,
                    stripe_account_id: stripeAccountId,
                    name: 'Invexis',
                    context: type === PAYMENT_TYPE.TIER ? `Tier payment for ${metadata?.tier_id}` : 'Platform Subscription'
                };
            }

            // 4. Initiate payment with appropriate gateway
            let gatewayResult;
            let gateway_token;

            switch (gateway) {
                /* case GATEWAY_TYPES.STRIPE:
                    gatewayResult = await stripeGateway.createPaymentIntent({
                        amount,
                        currency,
                        description,
                        metadata,
                        customer_email: customer?.email,
                        payee, // Pass payee for Stripe Connect if needed
                        idempotency_key,
                        reference_id,
                        type
                    });
                    gateway_token = gatewayResult.payment_intent_id;
                    break; */

                case GATEWAY_TYPES.MTN_MOMO:
                    gatewayResult = await mtnMomoGateway.initiatePayment({
                        amount,
                        currency,
                        phoneNumber,
                        description,
                        metadata,
                        payee // Injected payee
                    });
                    gateway_token = gatewayResult.reference_id;
                    break;

                case GATEWAY_TYPES.AIRTEL_MONEY:
                    gatewayResult = await airtelMoneyGateway.initiatePayment({
                        amount,
                        currency,
                        phoneNumber,
                        description,
                        metadata,
                        payee, // Injected payee
                        reference_id,
                        type
                    });
                    gateway_token = gatewayResult.reference_id;
                    break;

                /* case GATEWAY_TYPES.MPESA:
                    gatewayResult = await mpesaGateway.initiatePayment({
                        amount,
                        phoneNumber,
                        description,
                        metadata,
                        payee, // Injected payee
                        reference_id,
                        type
                    });
                    gateway_token = gatewayResult.checkout_request_id;
                    break; */

                case GATEWAY_TYPES.CASH:
                case GATEWAY_TYPES.MANUAL:
                    // Cash and Bank Transfers are immediately successful records
                    gatewayResult = {
                        success: true,
                        message: `${gateway === GATEWAY_TYPES.CASH ? 'Cash' : 'Bank transfer'} payment recorded`,
                        transaction_id: `${gateway.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(7)}`
                    };
                    gateway_token = gatewayResult.transaction_id;
                    break;

                default:
                    throw new Error(`Gateway ${gateway} not implemented or disabled`);
            }

            // ⚡ EDGE CASE: Check Gateway Success
            if (!gatewayResult.success) {
                const failureMsg = gatewayResult.message || 'Gateway initiation failed';
                await paymentRepository.updatePaymentStatus(payment.payment_id, {
                    status: PAYMENT_STATUS.FAILED,
                    failure_reason: failureMsg,
                    metadata: { ...metadata, gateway_response: gatewayResult }
                });

                // Trigger failed payment handler to create FAILED invoice
                await this.handleFailedPayment(payment, failureMsg);

                throw new Error(failureMsg);
            }

            // Update payment with gateway token
            // For CASH and MANUAL, we mark as SUCCEEDED immediately
            const isManual = gateway === GATEWAY_TYPES.CASH || gateway === GATEWAY_TYPES.MANUAL;
            const initialStatus = isManual ? PAYMENT_STATUS.SUCCEEDED : PAYMENT_STATUS.PROCESSING;
            const transactionStatus = isManual ? TRANSACTION_STATUS.SUCCEEDED : TRANSACTION_STATUS.PENDING;

            await paymentRepository.updatePaymentStatus(payment.payment_id, {
                status: initialStatus,
                gateway_token,
                metadata: { ...metadata, gateway_response: gatewayResult }
            });

            // Update transaction status
            await transactionRepository.updateTransactionStatus(transaction.transaction_id, {
                status: transactionStatus,
                gateway_transaction_id: gateway_token,
                metadata: { gateway_response: gatewayResult }
            });

            // If manual, trigger success handler immediately to generate PAID invoice
            if (isManual) {
                await this.handleSuccessfulPayment({
                    ...payment,
                    gateway_token,
                    status: PAYMENT_STATUS.SUCCEEDED
                });
            }

            // Publish event
            await publishPaymentEvent.processed({
                id: payment.payment_id,
                amount,
                currency,
                status: PAYMENT_STATUS.PROCESSING,
                order_id,
                metadata,
            });

            return {
                success: true,
                payment_id: payment.payment_id,
                transaction_id: transaction.transaction_id,
                gateway_token,
                status: PAYMENT_STATUS.PROCESSING,
                gateway_response: gatewayResult,
                message: 'Payment initiated successfully'
            };

        } catch (error) {
            console.error('Payment initiation error:', error.message);

            // Publish failure event (if RabbitMQ available)
            // Publish failure event
            await publishPaymentEvent.failed({
                id: payment ? payment.payment_id : 'unknown',
                amount,
                order_id,
            }, error.message);

            // If payment record exists but unexpected error, try to mark failed invoice
            if (payment) {
                await this.handleFailedPayment(payment, error.message);
            }

            throw error;
        }
    }

    async getAllSettings() {
        // This method might be obsolete now as we don't store settings locally
        // But we keep the interface for compatibility if any other service calls it
        return [];
    }

    /**
     * Internal: Normalize and alias incoming payment data
     * (e.g. mapping phone -> phoneNumber, currency defaults)
     */
    _normalizePaymentData(data) {
        // Default currency if not provided
        if (!data.currency) {
            data.currency = 'UGX'; // Default to Ugandan Shillings
        }

        // Alias 'phone' to 'phoneNumber' for consistency
        if (data.phone && !data.phoneNumber) {
            data.phoneNumber = data.phone;
            delete data.phone;
        }

        // Ensure metadata is an object
        if (!data.metadata || typeof data.metadata !== 'object') {
            data.metadata = {};
        }

        // Generate idempotency key if not provided
        if (!data.idempotency_key) {
            data.idempotency_key = `${data.seller_id || 'anon'}-${data.order_id || 'noorder'}-${Date.now()}`;
        }

        return data;
    }

    /**
     * Check payment status
     * @param {string} payment_id - Payment UUID
     * @returns {Promise<Object>} Payment status
     */
    async checkPaymentStatus(payment_id) {
        const payment = await paymentRepository.getPaymentById(payment_id);

        if (!payment) {
            throw new Error('Payment not found');
        }

        // If payment is already in final state, return it with rich data
        if ([PAYMENT_STATUS.SUCCEEDED, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.CANCELLED].includes(payment.status)) {
            const invoiceRepo = require('../repositories/invoiceRepository');
            const invoice = await invoiceRepo.getInvoiceByPaymentId(payment.payment_id);

            return {
                ...payment,
                invoice: invoice ? {
                    invoice_id: invoice.invoice_id,
                    pdf_url: invoice.pdf_url,
                    status: invoice.status,
                    amount_due: invoice.amount_due,
                    paid_at: invoice.paid_at
                } : null
            };
        }

        // Query gateway for latest status
        try {
            let gatewayStatus;

            switch (payment.gateway) {
                case GATEWAY_TYPES.STRIPE:
                    gatewayStatus = await stripeGateway.getPaymentStatus(payment.gateway_token);
                    break;

                case GATEWAY_TYPES.MTN_MOMO:
                    gatewayStatus = await mtnMomoGateway.checkPaymentStatus(payment.gateway_token);
                    break;

                case GATEWAY_TYPES.AIRTEL_MONEY:
                    gatewayStatus = await airtelMoneyGateway.checkPaymentStatus(payment.gateway_token);
                    break;

                case GATEWAY_TYPES.MPESA:
                    gatewayStatus = await mpesaGateway.checkPaymentStatus(payment.gateway_token);
                    break;

                default:
                    throw new Error(`Gateway ${payment.gateway} not supported`);
            }

            // Update payment status based on gateway response
            const newStatus = this.mapGatewayStatus(gatewayStatus.status, payment.gateway);

            if (newStatus !== payment.status) {
                await paymentRepository.updatePaymentStatus(payment_id, {
                    status: newStatus,
                    metadata: { ...payment.metadata, latest_gateway_status: gatewayStatus }
                });

                // If payment succeeded, generate invoice
                if (newStatus === PAYMENT_STATUS.SUCCEEDED) {
                    await this.handleSuccessfulPayment(payment);
                } else if (newStatus === PAYMENT_STATUS.FAILED) {
                    await this.handleFailedPayment(payment, 'Gateway returned failed status');
                }
            }

            // Fetch invoice info for the response
            const invoiceRepo = require('../repositories/invoiceRepository');
            const invoice = await invoiceRepo.getInvoiceByPaymentId(payment_id);

            return {
                ...(await paymentRepository.getPaymentById(payment_id)),
                gateway_status: gatewayStatus,
                invoice: invoice ? {
                    invoice_id: invoice.invoice_id,
                    pdf_url: invoice.pdf_url,
                    status: invoice.status,
                    amount_due: invoice.amount_due,
                    paid_at: invoice.paid_at
                } : null
            };

        } catch (error) {
            console.error('Error checking payment status:', error.message);
            throw error;
        }
    }

    /**
     * Handle successful payment and request invoice generation
     * @param {Object} payment - Payment record
     */
    async handleSuccessfulPayment(payment) {
        try {
            // Fetch company details for invoice header from company-service
            const companySettings = await internalServiceClient.getCompanySettings(payment.company_id);

            // 1. UPDATE Invoice Record in DB (Status: paid)
            const invoiceRepo = require('../repositories/invoiceRepository');
            let invoice = await invoiceRepo.getInvoiceByPaymentId(payment.payment_id || payment.id);

            // ⚡ CRITICAL: If not found by paymentId, try finding the "Bill" created during sale.created via saleId
            if (!invoice) {
                const saleId = payment.metadata?.saleId || payment.reference_id;
                if (saleId) {
                    console.log(`[PaymentService] Looking for existing invoice by saleId: ${saleId}`);
                    invoice = await invoiceRepo.getInvoiceBySaleId(saleId);
                }
            }

            if (!invoice) {
                console.warn(`[PaymentService] Warning: Invoice not found for payment ${payment.id}, creating simplified one.`);
                invoice = await invoiceService.generateInvoice({
                    payment_id: payment.payment_id,
                    seller_id: payment.seller_id,
                    company_id: payment.company_id,
                    amount: payment.amount,
                    currency: payment.currency,
                    description: payment.description,
                    metadata: payment.metadata
                }, payment.line_items || payment.metadata?.line_items || []);
            }

            // Mark as PAID and ensure payment_id is linked (important for link-back logic)
            await invoiceRepo.updateInvoiceStatus(invoice.invoice_id, {
                status: 'paid',
                payment_id: payment.payment_id || payment.id
            });

            // ⚡ UPDATE TRANSACTION STATUS (Audit Trail)
            const transactions = await transactionRepository.getTransactionsByPayment(payment.payment_id);
            const pendingTx = transactions.find(t => t.status === TRANSACTION_STATUS.PENDING) || transactions[transactions.length - 1];

            if (pendingTx) {
                await transactionRepository.updateTransactionStatus(pendingTx.transaction_id, {
                    status: TRANSACTION_STATUS.SUCCEEDED,
                    gateway_transaction_id: payment.gateway_token || pendingTx.gateway_transaction_id
                });
            }

            // 2. Determine Invoice Roles (Seller vs Buyer)
            let companyData, saleData;

            if (payment.type === 'SUBSCRIPTION' || payment.type === 'TIER') {
                // Scenario: Company pays Invexis
                // Seller = Invexis Platform
                companyData = {
                    name: 'Invexis Platform',
                    email: 'billing@invexis.com',
                    phone: '+250788000000', // Example Support Phone
                    address: 'Kigali, Rwanda',
                    logoUrl: 'https://res.cloudinary.com/invexis/image/upload/v1/branding/logo.png' // Default Logo
                };
                // Buyer = The Company
                saleData = {
                    saleId: payment.reference_id, // Subscription Ref
                    customerName: companySettings?.company_name || 'Valued Customer',
                    customerPhone: companySettings?.company_phone,
                    customerEmail: companySettings?.company_email
                };
            } else {
                // Scenario: Customer pays Company (Sale/Debt)
                // Seller = The Company
                const shopId = payment.shop_id || payment.metadata?.shopId;
                const shopData = await internalServiceClient.getShopData(shopId);
                const shopName = shopData?.name ? ` - ${shopData.name}` : '';

                companyData = {
                    name: companySettings?.company_name || 'Invexis User',
                    shopName: shopData?.name,
                    email: companySettings?.company_email,
                    phone: companySettings?.company_phone,
                    address: companySettings?.company_address,
                    logoUrl: companySettings?.metadata?.logo_url
                };
                // Buyer = The Customer
                saleData = {
                    saleId: payment.metadata?.saleId || payment.reference_id,
                    customerName: payment.customer?.name || payment.metadata?.customer_name || payment.metadata?.initiatedBy?.name || 'Guest',
                    customerPhone: payment.customer?.phone || payment.metadata?.customer_phone || payment.metadata?.phoneNumber || payment.phoneNumber || 'N/A',
                    customerEmail: payment.customer?.email || payment.metadata?.customer_email || payment.metadata?.email || 'N/A'
                };
            }

            // 3. Construct payload for document-service
            const invoicePayload = {
                invoiceData: {
                    invoiceId: invoice.invoice_id,
                    invoiceNumber: invoice.invoice_number || `INV-${Date.now()}`,
                    issueDate: new Date().toISOString(),
                    dueDate: new Date().toISOString(),
                    status: 'paid',
                    paymentMethod: payment.method || payment.gateway || 'cash',
                    subTotal: payment.amount,
                    totalAmount: payment.amount,
                    currency: payment.currency,
                    notes: payment.description
                },
                saleData,
                companyData,
                items: payment.line_items || payment.metadata?.line_items || [
                    {
                        productName: payment.description || 'Payment',
                        quantity: 1,
                        unitPrice: payment.amount,
                        total: payment.amount
                    }
                ],
                // Context for callback
                context: {
                    paymentId: payment.payment_id,
                    invoiceId: invoice.invoice_id
                },
                debtData: payment.type === 'DEBT' ? {
                    totalDebtAmount: payment.metadata?.totalDebtAmount,
                    balanceBeforeRepayment: payment.metadata?.balanceBeforeRepayment,
                    amountPaidNow: payment.metadata?.amountPaidNow,
                    remainingBalance: payment.metadata?.remainingBalance
                } : null,
                subscriptionData: (payment.type === 'SUBSCRIPTION' || payment.type === 'TIER') ? {
                    planName: payment.metadata?.planName || payment.metadata?.tier_id || 'Premium Plan',
                    billingCycle: payment.metadata?.billingCycle || 'Monthly',
                    validUntil: payment.metadata?.validUntil || payment.metadata?.next_billing_date
                } : null,
                currency: payment.currency,
                companyId: payment.company_id // ⚡ Critical for producer to extract owner
            };

            // 4. Publish event to trigger PDF generation
            await publishPaymentEvent.invoiceRequested(invoicePayload);

            // 5. Publish general success event
            await publishPaymentEvent.succeeded(payment);

        } catch (error) {
            console.error('Error handling successful payment:', error.message);
        }
    }

    /**
     * Handle failed payment
     * @param {Object} payment - Payment record
     * @param {string} reason - Failure reason
     */
    async handleFailedPayment(payment, reason) {
        try {
            console.log(`[PaymentService] Handling failed payment: ${payment.payment_id}`);

            // 1. Update Invoice to FAILED
            const invoiceRepo = require('../repositories/invoiceRepository');
            let invoice = await invoiceRepo.getInvoiceByPaymentId(payment.payment_id);

            if (invoice) {
                await invoiceRepo.updateInvoiceStatus(invoice.invoice_id, { status: 'failed' }); // or void

                // 2. We STILL want to generate the invoice PDF showing failure (Audit requirement)
                // Reuse logic from success but with failed status
                // Use internal service to fetch company details
                const companySettings = await internalServiceClient.getCompanySettings(payment.company_id);

                let companyData, saleData;
                // ... (Reuse role logic - simplified for brevity, assume similar structure)
                if (payment.type === 'SUBSCRIPTION' || payment.type === 'TIER') {
                    companyData = { name: 'Invexis Platform', email: 'billing@invexis.com' }; // minimal defaults
                    saleData = { saleId: payment.reference_id, customerName: companySettings?.company_name || 'Valued Customer' };
                } else {
                    const shopId = payment.shop_id || payment.metadata?.shopId;
                    const shopData = await internalServiceClient.getShopData(shopId);
                    const shopName = shopData?.name ? ` - ${shopData.name}` : '';

                    companyData = {
                        name: companySettings?.company_name || 'Invexis User',
                        shopName: shopData?.name
                    };
                    saleData = { saleId: payment.metadata?.saleId || payment.reference_id, customerName: payment.metadata?.customer_name || 'Guest' };
                }

                const invoicePayload = {
                    invoiceData: {
                        invoiceId: invoice.invoice_id,
                        invoiceNumber: invoice.invoice_number || `INV-FAILED-${Date.now()}`,
                        issueDate: new Date().toISOString(),
                        dueDate: new Date().toISOString(),
                        status: 'failed', // Mark as FAILED for PDF renderer
                        subTotal: payment.amount,
                        totalAmount: payment.amount,
                        currency: payment.currency,
                        notes: `Payment Failed: ${reason}`
                    },
                    saleData,
                    companyData,
                    items: payment.line_items || payment.metadata?.line_items || [],
                    context: {
                        paymentId: payment.payment_id,
                        invoiceId: invoice.invoice_id
                    },
                    debtData: payment.type === 'DEBT' ? {
                        totalDebtAmount: payment.metadata?.totalDebtAmount,
                        balanceBeforeRepayment: payment.metadata?.balanceBeforeRepayment,
                        amountPaidNow: payment.metadata?.amountPaidNow,
                        remainingBalance: payment.metadata?.remainingBalance
                    } : null,
                    subscriptionData: (payment.type === 'SUBSCRIPTION' || payment.type === 'TIER') ? {
                        planName: payment.metadata?.planName || payment.metadata?.tier_id || 'Premium Plan',
                        billingCycle: payment.metadata?.billingCycle || 'Monthly',
                        validUntil: payment.metadata?.validUntil || payment.metadata?.next_billing_date
                    } : null,
                    currency: payment.currency
                };

                // Trigger PDF generation for failed invoice
                await publishPaymentEvent.invoiceRequested(invoicePayload);
            }

            // ⚡ UPDATE TRANSACTION STATUS
            const transactions = await transactionRepository.getTransactionsByPayment(payment.payment_id);
            const pendingTx = transactions.find(t => t.status === TRANSACTION_STATUS.PENDING) || transactions[transactions.length - 1];

            if (pendingTx) {
                await transactionRepository.updateTransactionStatus(pendingTx.transaction_id, {
                    status: TRANSACTION_STATUS.FAILED,
                    metadata: { ...pendingTx.metadata, failure_reason: reason }
                });
            }

            await publishPaymentEvent.failed(payment, reason);
        } catch (error) {
            console.error('Error handling failed payment:', error.message);
        }
    }





    /**
     * Map gateway-specific status to standard payment status
     * @param {string} gatewayStatus - Gateway status
     * @param {string} gateway - Gateway type
     * @returns {string} Standard payment status
     */
    mapGatewayStatus(gatewayStatus, gateway) {
        const statusMap = {
            [GATEWAY_TYPES.STRIPE]: {
                'succeeded': PAYMENT_STATUS.SUCCEEDED,
                'processing': PAYMENT_STATUS.PROCESSING,
                'requires_payment_method': PAYMENT_STATUS.PENDING,
                'requires_confirmation': PAYMENT_STATUS.PENDING,
                'requires_action': PAYMENT_STATUS.PENDING,
                'canceled': PAYMENT_STATUS.CANCELLED,
                'failed': PAYMENT_STATUS.FAILED
            },
            [GATEWAY_TYPES.MTN_MOMO]: {
                'successful': PAYMENT_STATUS.SUCCEEDED,
                'pending': PAYMENT_STATUS.PROCESSING,
                'failed': PAYMENT_STATUS.FAILED
            },
            [GATEWAY_TYPES.AIRTEL_MONEY]: {
                'ts': PAYMENT_STATUS.SUCCEEDED,
                'pending': PAYMENT_STATUS.PROCESSING,
                'failed': PAYMENT_STATUS.FAILED
            },
            [GATEWAY_TYPES.MPESA]: {
                'succeeded': PAYMENT_STATUS.SUCCEEDED,
                'pending': PAYMENT_STATUS.PROCESSING,
                'failed': PAYMENT_STATUS.FAILED
            }
        };

        return statusMap[gateway]?.[gatewayStatus.toLowerCase()] || PAYMENT_STATUS.PROCESSING;
    }

    /**
     * Cancel a payment
     * @param {string} payment_id - Payment UUID
     * @param {string} reason - Cancellation reason
     * @returns {Promise<Object>} Updated payment
     */
    async cancelPayment(payment_id, reason) {
        const payment = await paymentRepository.getPaymentById(payment_id);

        if (!payment) {
            throw new Error('Payment not found');
        }

        if (payment.status !== PAYMENT_STATUS.PENDING && payment.status !== PAYMENT_STATUS.PROCESSING) {
            throw new Error(`Cannot cancel payment with status: ${payment.status}`);
        }

        return await paymentRepository.updatePaymentStatus(payment_id, {
            status: PAYMENT_STATUS.CANCELLED,
            cancellation_reason: reason
        });
    }

    /**
     * Placeholder for subscription processing
     * Resolves error: "paymentService.processDueSubscriptions is not a function"
     */
    async processDueSubscriptions() {
        console.log('--- processDueSubscriptions CALLED ---');
        // Implementation logic will go here for automated renewals
        return { success: true, processed: 0 };
    }

    /**
     * Get seller payments
     * @param {string} seller_id - Seller UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of payments
     */
    async getSellerPayments(seller_id, options = {}) {
        return await paymentRepository.getPaymentsBySeller(seller_id, options);
    }

    /**
     * Get company payments
     * @param {string} company_id - Company UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of payments
     */
    async getCompanyPayments(company_id, options = {}) {
        return await paymentRepository.getPaymentsByCompany(company_id, options);
    }

    /**
     * Get shop payments
     * @param {string} shop_id - Shop UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of payments
     */
    async getShopPayments(shop_id, options = {}) {
        return await paymentRepository.getPaymentsByShop(shop_id, options);
    }

    /**
     * Smart Normalization for Payment Data
     * Handles aliases, defaults, and auto-generation of keys
     */
    _normalizePaymentData(data) {
        const normalized = { ...data };

        // 1. Identifiers Aliases (Support both snake_case and camelCase)
        normalized.seller_id = data.seller_id || data.sellerId;
        normalized.company_id = data.company_id || data.companyId;
        normalized.shop_id = data.shop_id || data.shopId;
        normalized.order_id = data.order_id || data.orderId || data.saleId;

        // 2. Reference & Type
        normalized.type = data.type || data.paymentType || PAYMENT_TYPE.ECOMM;
        normalized.reference_id = data.reference_id || data.referenceId || normalized.order_id || 'manual_ref';

        // 3. Idempotency Key (Absolute must for production)
        normalized.idempotency_key = data.idempotency_key || data.idempotencyKey || `pay_${normalized.type.toLowerCase()}_${normalized.reference_id}_${Date.now()}`;

        // 4. Payment method/gateway normalization
        normalized.method = data.method || data.paymentMethod || 'manual';
        normalized.gateway = data.gateway || this._inferGateway(normalized.method);

        // 5. Contact info & Customer Object consolidation
        const cleanPhone = (p) => p ? p.replace(/[^0-9]/g, '') : null;
        normalized.phoneNumber = cleanPhone(data.phoneNumber || data.phone || data.customerPhone || data.customer?.phone);

        normalized.customer = data.customer || {
            name: data.customerName || data.name,
            email: data.customerEmail || data.customer_email || data.email,
            phone: normalized.phoneNumber
        };
        if (Array.isArray(data.line_items)) {
            normalized.line_items = data.line_items;
        } else if (Array.isArray(data.lineItems)) {
            normalized.line_items = data.lineItems;
        } else {
            // Force empty array if invalid or object provided
            normalized.line_items = [];
        }

        // 6. Currency defaults
        normalized.currency = (normalized.currency || 'XAF').toUpperCase();

        return normalized;
    }

    /**
     * Infer gateway from payment method if not provided
     */
    _inferGateway(method) {
        if (!method) return GATEWAY_TYPES.MANUAL;
        const m = method.toLowerCase();
        if (m.includes('mobile') || m.includes('momo') || m === 'mtn') return GATEWAY_TYPES.MTN_MOMO;
        if (m === 'airtel') return GATEWAY_TYPES.AIRTEL_MONEY;
        if (m === 'cash') return GATEWAY_TYPES.CASH;
        if (m === 'bank' || m.includes('transfer')) return GATEWAY_TYPES.MANUAL;

        // Strip out card/stripe/mpesa or return manual as fallback
        return GATEWAY_TYPES.MANUAL;
    }
}

module.exports = new PaymentService();
