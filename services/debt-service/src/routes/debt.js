
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/debtController');
const summaryCtrl = require('../controllers/analyticsController');
// Connection to shared middlewares
const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');
const { checkSubscriptionStatus } = require('/app/shared/middlewares/subscription/production-subscription');
const { checkFeatureAccess } = require('/app/shared/middlewares/subscription/checkFeatureAccess');

// --- Seeding endpoint ---
const seedCtrl = require('../controllers/seedController');

router.get('/', (req, res) => {
    res.json({ message: 'Debt service is running' });
});

// 🔒 SECURE ALL ROUTES BELOW THIS LINE
// 1. Must be logged in
// 2. Must have active subscription
// 3. Must have 'debt' feature enabled (Basic tier will be blocked here)
router.use(authenticateToken);
router.use(checkSubscriptionStatus());
// router.use(checkFeatureAccess('debt', 'enabled'));

// GET /debt/all -> list all debts across companies (no company/shop filter)
router.get('/all', ctrl.listAllDebts);

// POST /debt/create -> create a debt
router.post('/create', ctrl.createDebt);

// POST /debt/repayment -> record a repayment
router.post('/repayment', ctrl.recordRepayment);

// GET company debts
router.get('/company/:companyId/debts', ctrl.listCompanyDebts);
// GET company paid debts
router.get('/company/:companyId/debts/paid', ctrl.listCompanyPaidDebts);
// GET company partially-paid debts
router.get('/company/:companyId/debts/partially-paid', ctrl.listCompanyPartiallyPaidDebts);
// GET company unpaid debts
router.get('/company/:companyId/debts/unpaid', ctrl.listCompanyUnpaidDebts);

// GET shop debts
router.get('/shop/:shopId/debts', ctrl.listShopDebts);
// GET shop paid debts
router.get('/shop/:shopId/debts/paid', ctrl.listShopPaidDebts);
// GET shop partially-paid debts
router.get('/shop/:shopId/debts/partially-paid', ctrl.listShopPartiallyPaidDebts);
// GET shop unpaid debts
router.get('/shop/:shopId/debts/unpaid', ctrl.listShopUnpaidDebts);

// GET customer debts
router.get('/customer/:customerId/debts', ctrl.listCustomerDebts);
// GET customer paid debts
router.get('/customer/:customerId/debts/paid', ctrl.listCustomerPaidDebts);
// GET customer partially-paid debts
router.get('/customer/:customerId/debts/partially-paid', ctrl.listCustomerPartiallyPaidDebts);
// GET customer unpaid debts
router.get('/customer/:customerId/debts/unpaid', ctrl.listCustomerUnpaidDebts);

// Cross-company customer lookup by hashed id
router.get('/customer/hashed/:hashedId/debts', ctrl.crossCompanyCustomerDebts);
// Internal lookup for sales-service (no local internal auth middleware; shared middleware will be used by deployment)
router.post('/internal/lookup', ctrl.internalLookup);

// GET single debt
router.get('/:companyId/debt/:debtId', ctrl.getDebt);

// GET debt history (repayments + payment summary)
// Same payload as GET /:companyId/debt/:debtId but available at a dedicated path
router.get('/:companyId/debt/:debtId/history', ctrl.getDebt);
// Mark debt as paid (creates repayment for remaining amount and marks PAID)
router.post('/:debtId/mark-paid', ctrl.markDebtPaid);

// Cancel a debt (mark as CANCELLED)
router.post('/:debtId/cancel', ctrl.cancelDebt);

// PATCH update debt
router.patch('/:debtId', ctrl.updateDebt);

// DELETE soft-delete debt
router.delete('/:debtId', ctrl.softDeleteDebt);

// Manual reminder triggers
const reminderCtrl = require('../controllers/reminderController');
// POST /debt/:debtId/remind -> trigger manual reminder for a debt
router.post('/:debtId/remind', reminderCtrl.triggerDebtReminder);
// POST /debt/company/:companyId/remind -> trigger manual reminders for company (batch)
router.post('/company/:companyId/remind', reminderCtrl.triggerCompanyReminders);


const analytics = require('../controllers/analyticsController');

router.get('/analytics/company/:companyId', analytics.companyAnalytics);
router.get('/analytics/shop/:shopId', analytics.shopAnalytics);
router.get('/analytics/customer/:customerId', analytics.customerAnalytics);
router.get('/analytics/company/:companyId/aging', analytics.agingBuckets);


// sumery endpoints


// Company summary
router.get('/summary/company/:companyId', summaryCtrl.companySummary);
// Shop summary
router.get('/summary/shop/:shopId', summaryCtrl.shopSummary);
// Customer summary
router.get('/summary/customer/:customerId', summaryCtrl.customerSummary);
// Cross-company summary by hashedCustomerId
router.get('/summary/cross-company/:hashedCustomerId', summaryCtrl.crossCompanySummary);


// seed endpoints

router.post('/seed', seedCtrl.seedAllModels);

module.exports = router