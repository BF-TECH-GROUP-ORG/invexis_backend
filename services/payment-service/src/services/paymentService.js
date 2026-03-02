// src/services/paymentService.js
// Main payment service orchestrating all gateways and database operations

require('dotenv').config();
const internalServiceClient = require('./internalServiceClient');
const paymentRepository = require('../repositories/paymentRepository');
const transactionRepository = require('../repositories/transactionRepository');
const invoiceService = require('./invoiceService');
const { publishPaymentEvent } = require('../events/producer');
const { GATEWAY_TYPES, PAYMENT_STATUS, TRANSACTION_TYPE, TRANSACTION_STATUS, PAYMENT_TYPE, INVOICE_STATUS } = require('../utils/constants');
const { getParsed } = require('../utils/jsonUtils');

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

            // ⚡ DB FIX: Map statuses to valid DB Enums
            // For manual recordings (CASH, Bank Transfer, etc), we record them immediately as SUCCESS
            const isDebt = type === PAYMENT_TYPE.DEBT || metadata?.isDebt;
            const status = isDebt ? PAYMENT_STATUS.DEBT : PAYMENT_STATUS.SUCCEEDED;

            // ⚡ DB ENUM FIX: We added 'debt' to enums, so we can use it directly
            const dbStatus = status;
            const transStatus = TRANSACTION_STATUS.SUCCEEDED;

            // Generate a internal transaction ID
            const internalTxId = `${gateway.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const gateway_token = internalTxId;

            const gatewayResult = {
                success: true,
                message: `${gateway.toUpperCase()} payment recorded manually`,
                transaction_id: internalTxId
            };

            // Create initial transaction record as SUCCEEDED
            const transaction = await transactionRepository.createTransaction({
                payment_id: payment.payment_id,
                seller_id,
                company_id,
                shop_id,
                type: TRANSACTION_TYPE.CHARGE,
                amount,
                currency,
                status: transStatus,
                gateway_transaction_id: gateway_token,
                metadata: { gateway, initial_request: true, shop_id, gateway_response: gatewayResult }
            });

            // Update payment record with final status and token
            await paymentRepository.updatePaymentStatus(payment.payment_id, {
                status: dbStatus,
                gateway_token,
                metadata: { ...metadata, gateway_response: gatewayResult, is_debt: isDebt, original_status: status }
            });

            // Trigger success flow immediately to generate invoice (for both Debt and Paid)
            // (getParsed now imported from jsonUtils)
            await this.handleSuccessfulPayment({
                ...payment,
                line_items: getParsed(payment.line_items),
                metadata: getParsed(payment.metadata),
                gateway_token,
                status: status
            });

            if (isDebt) {
                console.log(`[PaymentService] Debt sale recorded for ${reference_id}. Status: DEBT`);
            }

            // 5. Publish event
            await publishPaymentEvent.processed({
                id: payment.payment_id,
                amount,
                currency,
                status: status,
                order_id,
                metadata: { ...metadata, isDebt },
            });

            return {
                success: true,
                payment_id: payment.payment_id,
                transaction_id: transaction.transaction_id,
                gateway_token,
                status: status,
                message: isDebt ? 'Debt recorded successfully' : 'Payment recorded successfully'
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

        // Since all payments are now manual recordings, the status is final once set
        // Fetch invoice info for the response
        const invoiceRepo = require('../repositories/invoiceRepository');
        const invoice = await invoiceRepo.getInvoiceByPaymentId(payment.payment_id || payment.id);

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
                    metadata: getParsed(payment.metadata),
                    lineItems: getParsed(payment.line_items || payment.metadata?.line_items || [])
                });
            }

            // Mark as PAID/DEBT and ensure payment_id is linked
            let invoiceStatus = (payment.status === PAYMENT_STATUS.DEBT) ? INVOICE_STATUS.DEBT : INVOICE_STATUS.PAID;

            // ⚡ REFINEMENT: If this is a debt repayment and the balance is now zero, show "PAID" on the final invoice
            if (payment.type === 'DEBT' && Number(payment.metadata?.remainingBalance) === 0) {
                console.log(`[PaymentService] Debt fully cleared for payment ${payment.id || payment.payment_id}. Marking invoice as PAID.`);
                invoiceStatus = INVOICE_STATUS.PAID;
            }

            await invoiceRepo.updateInvoiceStatus(invoice.invoice_id, {
                status: invoiceStatus,
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
                    status: invoiceStatus,
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
