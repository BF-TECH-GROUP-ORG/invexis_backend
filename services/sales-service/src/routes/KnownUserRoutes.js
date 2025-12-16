const express = require("express");
const router = express.Router();
const knownUserController = require("../controllers/KnownUserController");
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');
// const {
//   checkSubscriptionActive,
//   checkFeatureAccess,
//   checkRateLimits,
// } = require("/app/shared/middlewares/subscription");

// Apply rate limiting
// router.use(
//   checkRateLimits({
//     limits: { basic: 200, mid: 1000, pro: 5000 },
//     windowMs: 60000,
//     companyIdSource: "body",
//     companyIdField: "company_id",
//   })
// );

// Apply subscription validation for modifying operations
// router.use((req, res, next) => {
//   if (["POST", "PUT", "DELETE"].includes(req.method)) {
//     return checkSubscriptionActive({
//       companyIdSource: "body",
//       companyIdField: "company_id",
//     })(req, res, next);
//   }
//   next();
// });

/**
 * POST /known-users
 * Create a new KnownUser
 */
router.post("/", authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), knownUserController.createKnownUser);

/**
 * GET /known-users/search
 * Search KnownUsers by phone or email
 * Query params: companyId (required), phone or email (required)
 */
router.get("/search", authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), knownUserController.searchKnownUsers);

/**
 * GET /known-users
 * List all KnownUsers for a company
 * Query params: companyId (required), limit, offset, isActive
 */
router.get("/", authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), knownUserController.listKnownUsers);

/**
 * GET /known-users/:id
 * Get a specific KnownUser by ID
 */
router.get("/:id", authenticateToken, requireRole(['super_admin','company_admin' ,'worker']), knownUserController.getKnownUser);

/**
 * PUT /known-users/:id
 * Update a KnownUser
 * Allowed fields: customerName, customerPhone, customerEmail, customerAddress, customerId
 */
router.put(
  "/:id",
  // checkFeatureAccess("sales", "internalStaffSales"),
  authenticateToken, requireRole(['super_admin','company_admin' ,'worker']),
  knownUserController.updateKnownUser
);

/**
 * DELETE /known-users/:id
 * Deactivate (soft delete) a KnownUser
 */
router.delete(
  "/:id",
  authenticateToken, requireRole(['super_admin','company_admin' ,'worker']),
  // checkFeatureAccess("sales", "internalStaffSales"),
  knownUserController.deactivateKnownUser
);

module.exports = router;
