const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/debtController');

router.get('/', (req, res) => {
    res.json({ message: 'Debt service is running' });
});

// GET /debt/all -> list all debts across companies (no company/shop filter)
router.get('/all', ctrl.listAllDebts);

// POST /debt/create -> create a debt
router.post('/create', ctrl.createDebt);

// POST /debt/repayment -> record a repayment
router.post('/repayment', ctrl.recordRepayment);

// GET company debts
router.get('/company/:companyId/debts', ctrl.listCompanyDebts);

// GET shop debts
router.get('/shop/:shopId/debts', ctrl.listShopDebts);

// GET customer debts
router.get('/customer/:customerId/debts', ctrl.listCustomerDebts);

// Cross-company customer lookup by hashed id
router.get('/customer/hashed/:hashedId/debts', ctrl.crossCompanyCustomerDebts);
// Internal lookup for sales-service (no local internal auth middleware; shared middleware will be used by deployment)
router.post('/internal/lookup', ctrl.internalLookup);

// GET single debt
router.get('/:companyId/debt/:debtId', ctrl.getDebt);

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

module.exports = router;