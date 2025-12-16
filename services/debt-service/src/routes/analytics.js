const express = require('express');
const router = express.Router();
const analytics = require('../controllers/analyticsController');

router.get('/company/:companyId', analytics.companyAnalytics);
router.get('/shop/:shopId', analytics.shopAnalytics);
router.get('/customer/:customerId', analytics.customerAnalytics);
router.get('/company/:companyId/aging', analytics.agingBuckets);

module.exports = router;
