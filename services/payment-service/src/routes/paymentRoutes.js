// src/routes/paymentRoutes.js
// Payment routes with shared auth middleware and local payment middleware.

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

const {
    requireAuth,
    requireRole
} = require('/app/shared/middlewares/auth/auth.js')

const {
    idempotencyCheck,
    cacheIdempotencyResponse,
    rateLimitPayments,
    validateWebhookSignature
} = require('../middleware/paymentMiddleware')


router.get('/', (req, res) => {
    res.send('Payment Service is routed to gateway');
})

// Public (guest e-com initiate—no auth)
router.post('/initiate', idempotencyCheck, rateLimitPayments(), paymentController.initiatePayment, cacheIdempotencyResponse);

// Protected (auth required for status/report)
router.get('/status/:transactionId', requireAuth, rateLimitPayments(10), paymentController.checkPaymentStatus);

// Reports (admin only)
router.get('/report', requireAuth, requireRole(['company_admin', 'super_admin']), paymentController.getPaymentReport);

// Webhooks (no auth, validated in middleware/controller)
router.post('/webhook/stripe', validateWebhookSignature('stripe'), paymentController.handleStripeWebhook);
router.post('/webhook/mtn', validateWebhookSignature('mtn'), paymentController.handleMTNWebhook);
router.post('/webhook/airtel', validateWebhookSignature('airtel'), paymentController.handleAirtelWebhook);

module.exports = router;