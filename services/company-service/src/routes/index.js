const companyRoutes = require('./companyRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
// STRIPE DISABLED: Commenting out Stripe webhook functionality
// const { handleStripeConnectWebhook } = require('../controllers/webhookController');
const express = require('express')
const router = express.Router()

router.get('/', (req, res) => {
    res.json({ message: "company service routed to gateway" })
})
router.use('/companies', companyRoutes);
router.use('/subscriptions', subscriptionRoutes);
// STRIPE DISABLED: Webhook route commented out
// router.post('/webhooks/stripe/connect', handleStripeConnectWebhook);


module.exports = router
