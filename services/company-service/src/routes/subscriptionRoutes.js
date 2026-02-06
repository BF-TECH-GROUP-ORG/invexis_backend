const express = require("express");
const {
  createSubscription,
  getSubscriptionByCompany,
  updateSubscription,
  renewSubscription,
  initiateSubscriptionPayment,
  manualUnlock,
  deactivateSubscription,
  checkSubscriptionStatus,
  getSubscriptionFeatures,
  checkFeatureAccess,
  getEnabledFeatures,
  getDisabledFeatures,
  getUpgradeSuggestions,
  getSubscriptionSummary,
} = require("../controllers/subscriptionController");
const { authenticateToken, requireRole } = require("/app/shared/middlewares/auth/production-auth");

const router = express.Router();

// Subscription management
router.post("/", authenticateToken, requireRole(["super_admin"]), createSubscription);
router.get("/company/:companyId", authenticateToken, getSubscriptionByCompany);
router.get("/company/:companyId/status", authenticateToken, checkSubscriptionStatus);
router.put("/company/:companyId", authenticateToken, requireRole(["super_admin"]), updateSubscription);
router.post("/company/:companyId/renew", authenticateToken, requireRole(["super_admin", "company_admin"]), renewSubscription);
router.post("/company/:companyId/initiate-payment", authenticateToken, requireRole(["super_admin", "company_admin"]), initiateSubscriptionPayment);
router.post("/company/:companyId/manual-unlock", authenticateToken, requireRole(["super_admin"]), manualUnlock);
router.patch("/company/:companyId/deactivate", authenticateToken, requireRole(["super_admin"]), deactivateSubscription);

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
