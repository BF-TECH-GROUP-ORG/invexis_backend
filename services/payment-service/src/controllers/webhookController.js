// src/controllers/webhookController.js
// Webhook controller for handling gateway callbacks

const paymentRepository = require('../repositories/paymentRepository');
const paymentService = require('../services/paymentService');
const stripeGateway = require('../services/gateways/stripeGateway');
const mtnMomoGateway = require('../services/gateways/mtnMomoGateway');
const airtelMoneyGateway = require('../services/gateways/airtelMoneyGateway');
const mpesaGateway = require('../services/gateways/mpesaGateway');
const { PAYMENT_STATUS } = require('../utils/constants');

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
                    if (processedEvent.event_type === 'payment_succeeded') {
                        // Update status + metadata first to ensure state is clean
                        await paymentRepository.updatePaymentStatus(payment.payment_id, {
                            status: PAYMENT_STATUS.SUCCEEDED,
                            metadata: { ...payment.metadata, webhook_event: processedEvent }
                        });
                        // Delegate to service for downstream actions (Transaction, Invoice, Event)
                        await paymentService.handleSuccessfulPayment(payment);

                    } else if (processedEvent.event_type === 'payment_failed') {
                        await paymentRepository.updatePaymentStatus(payment.payment_id, {
                            status: PAYMENT_STATUS.FAILED,
                            failure_reason: processedEvent.failure_message,
                            metadata: { ...payment.metadata, webhook_event: processedEvent }
                        });
                        await paymentService.handleFailedPayment(payment, processedEvent.failure_message);
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
                if (processedCallback.event_type === 'payment_succeeded') {
                    await paymentRepository.updatePaymentStatus(payment.payment_id, {
                        status: PAYMENT_STATUS.SUCCEEDED,
                        metadata: { ...payment.metadata, mtn_callback: processedCallback }
                    });
                    await paymentService.handleSuccessfulPayment(payment);

                } else {
                    await paymentRepository.updatePaymentStatus(payment.payment_id, {
                        status: PAYMENT_STATUS.FAILED,
                        metadata: { ...payment.metadata, mtn_callback: processedCallback }
                    });
                    await paymentService.handleFailedPayment(payment, 'MTN Webhook reported failure');
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
                if (processedCallback.event_type === 'payment_succeeded') {
                    await paymentRepository.updatePaymentStatus(payment.payment_id, {
                        status: PAYMENT_STATUS.SUCCEEDED,
                        metadata: { ...payment.metadata, airtel_callback: processedCallback }
                    });
                    await paymentService.handleSuccessfulPayment(payment);

                } else {
                    await paymentRepository.updatePaymentStatus(payment.payment_id, {
                        status: PAYMENT_STATUS.FAILED,
                        metadata: { ...payment.metadata, airtel_callback: processedCallback }
                    });
                    await paymentService.handleFailedPayment(payment, 'Airtel Webhook reported failure');
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
                if (processedCallback.event_type === 'payment_succeeded') {
                    await paymentRepository.updatePaymentStatus(payment.payment_id, {
                        status: PAYMENT_STATUS.SUCCEEDED,
                        metadata: { ...payment.metadata, mpesa_callback: processedCallback }
                    });
                    await paymentService.handleSuccessfulPayment(payment);

                } else {
                    await paymentRepository.updatePaymentStatus(payment.payment_id, {
                        status: PAYMENT_STATUS.FAILED,
                        metadata: { ...payment.metadata, mpesa_callback: processedCallback }
                    });
                    await paymentService.handleFailedPayment(payment, 'M-Pesa Webhook reported failure');
                }
            }

            res.status(200).json({ received: true });

        } catch (error) {
            console.error('M-Pesa webhook error:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new WebhookController();
