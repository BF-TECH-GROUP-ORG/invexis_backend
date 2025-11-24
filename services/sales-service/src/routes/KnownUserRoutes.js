const express = require("express");
const router = express.Router();
const knownUserController = require("../controllers/KnownUserController");
const {
  checkSubscriptionActive,
  checkFeatureAccess,
  checkRateLimits,
} = require("/app/shared/middlewares/subscription");

// Apply rate limiting
router.use(
  checkRateLimits({
    limits: { basic: 200, mid: 1000, pro: 5000 },
    windowMs: 60000,
    companyIdSource: "body",
    companyIdField: "company_id",
  })
);

// Apply subscription validation for modifying operations
router.use((req, res, next) => {
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    return checkSubscriptionActive({
      companyIdSource: "body",
      companyIdField: "company_id",
    })(req, res, next);
  }
  next();
});

/**
 * POST /known-users
 * Create a new KnownUser
 */
router.post("/", checkFeatureAccess("sales", "internalStaffSales"), knownUserController.createKnownUser);

/**
 * GET /known-users/search
 * Search KnownUsers by phone or email
 * Query params: companyId (required), phone or email (required)
 */
router.get("/search", knownUserController.searchKnownUsers);

/**
 * GET /known-users
 * List all KnownUsers for a company
 * Query params: companyId (required), limit, offset, isActive
 */
router.get("/", knownUserController.listKnownUsers);

/**
 * GET /known-users/:id
 * Get a specific KnownUser by ID
 */
router.get("/:id", knownUserController.getKnownUser);

/**
 * PUT /known-users/:id
 * Update a KnownUser
 * Allowed fields: customerName, customerPhone, customerEmail, customerAddress, customerId
 */
router.put(
  "/:id",
  checkFeatureAccess("sales", "internalStaffSales"),
  knownUserController.updateKnownUser
);

/**
 * DELETE /known-users/:id
 * Deactivate (soft delete) a KnownUser
 */
router.delete(
  "/:id",
  checkFeatureAccess("sales", "internalStaffSales"),
  knownUserController.deactivateKnownUser
);

module.exports = router;
