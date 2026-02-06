// src/routes/paymentRoutes.js
// Comprehensive routing for payment service

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const webhookController = require('../controllers/webhookController');
const invoiceController = require('../controllers/invoiceController');
const transactionController = require('../controllers/transactionController');
const reportingController = require('../controllers/reportingController');

const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');

// Health check
router.get('/', (req, res) => {
  res.json({ message: 'Payment Service is running.' });
});

// Protect all following routes except webhooks
router.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) {
    return next();
  }
  authenticateToken(req, res, next);
});

// ==================== Payment Routes ====================
// Initiate payment
router.post('/initiate', paymentController.initiatePayment.bind(paymentController));

// Get payment status
router.get('/status/:payment_id', paymentController.getPaymentStatus.bind(paymentController));

// Get seller payments
router.get('/seller/:seller_id', paymentController.getSellerPayments.bind(paymentController));

// Get company payments
router.get('/company/:company_id', paymentController.getCompanyPayments.bind(paymentController));

// Get all company settings (debugging)
router.get('/settings/all', paymentController.getAllSettings.bind(paymentController));

// Get shop payments
router.get('/shop/:shop_id', paymentController.getShopPayments.bind(paymentController));

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


// ==================== Transaction Routes ====================

// Get seller transactions
router.get('/transactions/seller/:seller_id', transactionController.getSellerTransactions.bind(transactionController));

// Get company transactions
router.get('/transactions/company/:company_id', transactionController.getCompanyTransactions.bind(transactionController));

// Get shop transactions
router.get('/transactions/shop/:shop_id', transactionController.getShopTransactions.bind(transactionController));

// ==================== Platform & Charts Routes ====================
// Platform Overview (Admin)
router.get('/reports/platform/overview', reportingController.getPlatformOverview.bind(reportingController));
router.get('/reports/platform/top-companies', reportingController.getPlatformTopCompanies.bind(reportingController));

// Dashboard Charts (User/Admin)
router.get('/reports/charts/dashboard', reportingController.getDashboardCharts.bind(reportingController));


// ==================== Invoice Routes ====================

// Get invoice by ID
router.get('/invoices/:invoice_id', invoiceController.getInvoice.bind(invoiceController));

// Get seller invoices
router.get('/invoices/seller/:seller_id', invoiceController.getSellerInvoices.bind(invoiceController));

// Get company invoices
router.get('/invoices/company/:company_id', invoiceController.getCompanyInvoices.bind(invoiceController));

// Get shop invoices
router.get('/invoices/shop/:shop_id', invoiceController.getShopInvoices.bind(invoiceController));

// Download invoice PDF
router.get('/invoices/:invoice_id/pdf', invoiceController.downloadInvoicePDF.bind(invoiceController));


// ==================== Reporting Routes ====================

// Get seller monthly totals
router.get('/reports/seller/:seller_id/monthly', reportingController.getSellerMonthlyTotals.bind(reportingController));

// Get comprehensive revenue summary (Company + Shops)
router.get('/reports/revenue-summary', reportingController.getRevenueSummary.bind(reportingController));

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

// Get company analytics
router.get('/reports/company/:company_id/analytics', reportingController.getCompanyAnalytics.bind(reportingController));

// Get payout history
router.get('/reports/payouts', reportingController.getPayoutHistory.bind(reportingController));

module.exports = router;