const express = require("express");
const {
  createSubscription,
  getSubscriptionByCompany,
  updateSubscription,
  renewSubscription,
  deactivateSubscription,
  checkSubscriptionStatus,
  getSubscriptionFeatures,
  checkFeatureAccess,
  getEnabledFeatures,
  getDisabledFeatures,
  getUpgradeSuggestions,
  getSubscriptionSummary,
} = require("../controllers/subscriptionController");

const router = express.Router();

// Subscription management
router.post("/", createSubscription);
router.get("/company/:companyId", getSubscriptionByCompany);
router.get("/company/:companyId/status", checkSubscriptionStatus);
router.put("/company/:companyId", updateSubscription);
router.post("/company/:companyId/renew", renewSubscription);
router.patch("/company/:companyId/deactivate", deactivateSubscription);

// Subscription features
router.get("/company/:companyId/features", getSubscriptionFeatures);
// const subscriptionMiddleware = require("../../../../shared/middlewares/subscription/subscription");
router.post(
  "/company/:companyId/check-feature",
  // subscriptionMiddleware("ecommerce", "productBrowsing"),
  checkFeatureAccess
);
router.get("/company/:companyId/enabled-features", getEnabledFeatures);
router.get("/company/:companyId/disabled-features", getDisabledFeatures);
router.get("/company/:companyId/upgrade-suggestions", getUpgradeSuggestions);
router.get("/company/:companyId/summary", getSubscriptionSummary);

module.exports = router;
