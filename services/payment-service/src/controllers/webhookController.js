// src/controllers/webhookController.js
// Webhook controller for handling gateway callbacks

const paymentRepository = require('../repositories/paymentRepository');
const transactionRepository = require('../repositories/transactionRepository');
const invoiceService = require('../services/invoiceService');
const stripeGateway = require('../services/gateways/stripeGateway');
const mtnMomoGateway = require('../services/gateways/mtnMomoGateway');
const airtelMoneyGateway = require('../services/gateways/airtelMoneyGateway');
const mpesaGateway = require('../services/gateways/mpesaGateway');
const { PAYMENT_STATUS, TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../utils/constants');

class WebhookController {
    /**
     * Handle Stripe webhook
     * POST /payment/webhooks/stripe
     */
    async handleStripeWebhook(req, res) {
        try {
            const signature = req.headers['stripe-signature'];
            const rawBody = req.rawBody; // Need raw body for signature verification

            // Verify webhook signature
            const event = stripeGateway.verifyWebhookSignature(rawBody, signature);

            // Process webhook event
            const processedEvent = await stripeGateway.handleWebhook(event);

            // Update payment based on event
            if (processedEvent.payment_intent_id) {
                const payment = await paymentRepository.getPaymentById(processedEvent.payment_intent_id);

                if (payment) {
                    let newStatus;
                    if (processedEvent.event_type === 'payment_succeeded') {
                        newStatus = PAYMENT_STATUS.SUCCEEDED;

                        // Generate invoice
                        await this.handleSuccessfulPayment(payment);
                    } else if (processedEvent.event_type === 'payment_failed') {
                        newStatus = PAYMENT_STATUS.FAILED;
                    }

                    if (newStatus) {
                        await paymentRepository.updatePaymentStatus(payment.payment_id, {
                            status: newStatus,
                            failure_reason: processedEvent.failure_message,
                            metadata: { ...payment.metadata, webhook_event: processedEvent }
                        });

                        // Log transaction
                        await transactionRepository.createTransaction({
                            payment_id: payment.payment_id,
                            user_id: payment.user_id,
                            seller_id: payment.seller_id,
                            company_id: payment.company_id,
                            type: TRANSACTION_TYPE.CHARGE,
                            amount: payment.amount,
                            currency: payment.currency,
                            status: newStatus === PAYMENT_STATUS.SUCCEEDED ? TRANSACTION_STATUS.SUCCEEDED : TRANSACTION_STATUS.FAILED,
                            gateway_transaction_id: processedEvent.payment_intent_id,
                            metadata: { webhook_event: processedEvent }
                        });
                    }
                }
            }

            res.status(200).json({ received: true });

        } catch (error) {
            console.error('Stripe webhook error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * Handle MTN MoMo webhook
     * POST /payment/webhooks/mtn
     */
    async handleMTNWebhook(req, res) {
        try {
            const callbackData = req.body;

            // Process callback
            const processedCallback = await mtnMomoGateway.handleCallback(callbackData);

            // Find payment by reference ID
            const payments = await paymentRepository.getPaymentsByGateway('mtn_momo', { limit: 1 });
            const payment = payments.find(p => p.gateway_token === processedCallback.reference_id);

            if (payment) {
                const newStatus = processedCallback.event_type === 'payment_succeeded'
                    ? PAYMENT_STATUS.SUCCEEDED
                    : PAYMENT_STATUS.FAILED;

                await paymentRepository.updatePaymentStatus(payment.payment_id, {
                    status: newStatus,
                    metadata: { ...payment.metadata, mtn_callback: processedCallback }
                });

                // Log transaction
                await transactionRepository.createTransaction({
                    payment_id: payment.payment_id,
                    user_id: payment.user_id,
                    seller_id: payment.seller_id,
                    company_id: payment.company_id,
                    type: TRANSACTION_TYPE.CHARGE,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: newStatus === PAYMENT_STATUS.SUCCEEDED ? TRANSACTION_STATUS.SUCCEEDED : TRANSACTION_STATUS.FAILED,
                    gateway_transaction_id: processedCallback.financial_transaction_id,
                    metadata: { mtn_callback: processedCallback }
                });

                if (newStatus === PAYMENT_STATUS.SUCCEEDED) {
                    await this.handleSuccessfulPayment(payment);
                }
            }

            res.status(200).json({ received: true });

        } catch (error) {
            console.error('MTN webhook error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * Handle Airtel Money webhook
     * POST /payment/webhooks/airtel
     */
    async handleAirtelWebhook(req, res) {
        try {
            const callbackData = req.body;

            // Process callback
            const processedCallback = await airtelMoneyGateway.handleCallback(callbackData);

            // Find payment by transaction ID
            const payments = await paymentRepository.getPaymentsByGateway('airtel_money', { limit: 100 });
            const payment = payments.find(p => p.gateway_token === processedCallback.reference_id);

            if (payment) {
                const newStatus = processedCallback.event_type === 'payment_succeeded'
                    ? PAYMENT_STATUS.SUCCEEDED
                    : PAYMENT_STATUS.FAILED;

                await paymentRepository.updatePaymentStatus(payment.payment_id, {
                    status: newStatus,
                    metadata: { ...payment.metadata, airtel_callback: processedCallback }
                });

                // Log transaction
                await transactionRepository.createTransaction({
                    payment_id: payment.payment_id,
                    user_id: payment.user_id,
                    seller_id: payment.seller_id,
                    company_id: payment.company_id,
                    type: TRANSACTION_TYPE.CHARGE,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: newStatus === PAYMENT_STATUS.SUCCEEDED ? TRANSACTION_STATUS.SUCCEEDED : TRANSACTION_STATUS.FAILED,
                    gateway_transaction_id: processedCallback.transaction_id,
                    metadata: { airtel_callback: processedCallback }
                });

                if (newStatus === PAYMENT_STATUS.SUCCEEDED) {
                    await this.handleSuccessfulPayment(payment);
                }
            }

            res.status(200).json({ received: true });

        } catch (error) {
            console.error('Airtel webhook error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * Handle M-Pesa webhook
     * POST /payment/webhooks/mpesa
     */
    async handleMpesaWebhook(req, res) {
        try {
            const callbackData = req.body;

            // Process callback
            const processedCallback = await mpesaGateway.handleCallback(callbackData);

            // Find payment by checkout request ID
            const payments = await paymentRepository.getPaymentsByGateway('mpesa', { limit: 100 });
            const payment = payments.find(p => p.gateway_token === processedCallback.checkout_request_id);

            if (payment) {
                const newStatus = processedCallback.event_type === 'payment_succeeded'
                    ? PAYMENT_STATUS.SUCCEEDED
                    : PAYMENT_STATUS.FAILED;

                await paymentRepository.updatePaymentStatus(payment.payment_id, {
                    status: newStatus,
                    metadata: { ...payment.metadata, mpesa_callback: processedCallback }
                });

                // Log transaction
                await transactionRepository.createTransaction({
                    payment_id: payment.payment_id,
                    user_id: payment.user_id,
                    seller_id: payment.seller_id,
                    company_id: payment.company_id,
                    type: TRANSACTION_TYPE.CHARGE,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: newStatus === PAYMENT_STATUS.SUCCEEDED ? TRANSACTION_STATUS.SUCCEEDED : TRANSACTION_STATUS.FAILED,
                    gateway_transaction_id: processedCallback.mpesa_receipt_number,
                    metadata: { mpesa_callback: processedCallback }
                });

                if (newStatus === PAYMENT_STATUS.SUCCEEDED) {
                    await this.handleSuccessfulPayment(payment);
                }
            }

            res.status(200).json({ received: true });

        } catch (error) {
            console.error('M-Pesa webhook error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * Handle successful payment (generate invoice)
     */
    async handleSuccessfulPayment(payment) {
        try {
            const invoice = await invoiceService.generateInvoice({
                payment_id: payment.payment_id,
                user_id: payment.user_id,
                seller_id: payment.seller_id,
                company_id: payment.company_id,
                amount: payment.amount,
                currency: payment.currency,
                description: payment.description,
                metadata: payment.metadata
            }, payment.metadata?.line_items || []);

            await invoiceService.generatePDF(invoice.invoice_id);
            await invoiceService.markAsPaid(invoice.invoice_id);

        } catch (error) {
            console.error('Error handling successful payment:', error);
        }
    }
}

module.exports = new WebhookController();
