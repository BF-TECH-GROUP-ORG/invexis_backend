const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/debtController');

router.get('/', (req, res) => {
    res.json({ message: 'Debt service is running' });
});

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

// GET single debt
router.get('/:companyId/debt/:debtId', ctrl.getDebt);

// Analytics
router.get('/analytics/company/:companyId', ctrl.companyAnalytics);
router.get('/analytics/shop/:shopId', ctrl.shopAnalytics);
router.get('/analytics/customer/:customerId', ctrl.customerAnalytics);

module.exports = router;