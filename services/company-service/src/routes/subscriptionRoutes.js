const express = require('express');
const {
  createSubscription,
  getSubscriptionByCompany,
  updateSubscription,
  renewSubscription,
  deactivateSubscription,
  checkSubscriptionStatus,
} = require('../controllers/subscriptionController');

const router = express.Router();

// Subscription management
router.post('/', createSubscription);
router.get('/company/:companyId', getSubscriptionByCompany);
router.get('/company/:companyId/status', checkSubscriptionStatus);
router.put('/company/:companyId', updateSubscription);
router.post('/company/:companyId/renew', renewSubscription);
router.patch('/company/:companyId/deactivate', deactivateSubscription);

module.exports = router;

