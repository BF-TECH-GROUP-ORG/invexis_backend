// src/routes/paymentRoutes.js
// Comprehensive routing for payment service

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const webhookController = require('../controllers/webhookController');
const invoiceController = require('../controllers/invoiceController');
const reportingController = require('../controllers/reportingController');

// Health check
router.get('/', (req, res) => {
  res.json({ message: 'Payment Service is running.' });
});

// ==================== Payment Routes ====================
// Initiate payment
router.post('/initiate', paymentController.initiatePayment.bind(paymentController));

// Get payment status
router.get('/status/:payment_id', paymentController.getPaymentStatus.bind(paymentController));

// Get user payments
router.get('/user/:user_id', paymentController.getUserPayments.bind(paymentController));

// Get seller payments
router.get('/seller/:seller_id', paymentController.getSellerPayments.bind(paymentController));

// Cancel payment
router.post('/cancel/:payment_id', paymentController.cancelPayment.bind(paymentController));

// ==================== Webhook Routes ====================
// Stripe webhook
router.post('/webhooks/stripe', webhookController.handleStripeWebhook.bind(webhookController));

// MTN MoMo webhook
router.post('/webhooks/mtn', webhookController.handleMTNWebhook.bind(webhookController));

// Airtel Money webhook
router.post('/webhooks/airtel', webhookController.handleAirtelWebhook.bind(webhookController));

// M-Pesa webhook
router.post('/webhooks/mpesa', webhookController.handleMpesaWebhook.bind(webhookController));

// ==================== Invoice Routes ====================
// Get invoice by ID
router.get('/invoices/:invoice_id', invoiceController.getInvoice.bind(invoiceController));

// Get user invoices
router.get('/invoices/user/:user_id', invoiceController.getUserInvoices.bind(invoiceController));

// Get seller invoices
router.get('/invoices/seller/:seller_id', invoiceController.getSellerInvoices.bind(invoiceController));

// Download invoice PDF
router.get('/invoices/:invoice_id/pdf', invoiceController.downloadInvoicePDF.bind(invoiceController));

// ==================== Reporting Routes ====================
// Get seller monthly totals
router.get('/reports/seller/:seller_id/monthly', reportingController.getSellerMonthlyTotals.bind(reportingController));

// Get payment statistics
router.get('/reports/stats', reportingController.getPaymentStats.bind(reportingController));

// Get gateway performance
router.get('/reports/gateway-performance', reportingController.getGatewayPerformance.bind(reportingController));

// Get payment trends
router.get('/reports/trends', reportingController.getPaymentTrends.bind(reportingController));

// Export transaction history
router.get('/reports/export/transactions', reportingController.exportTransactionHistory.bind(reportingController));

// Get shop analytics
router.get('/reports/shop/:shop_id/analytics', reportingController.getShopAnalytics.bind(reportingController));

// Get top products
router.get('/reports/top-products', reportingController.getTopProducts.bind(reportingController));

// Get payout history
router.get('/reports/payouts', reportingController.getPayoutHistory.bind(reportingController));

module.exports = router;