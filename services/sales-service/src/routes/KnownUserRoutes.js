const express = require("express");
const router = express.Router();
const knownUserController = require("../controllers/KnownUserController");
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');
;

/**
 * GET /known-users/all
 * List all users in the system (Super Admin / Support)
 */
router.get("/all", authenticateToken, requireRole(['super_admin','company_admin' , 'worker']), knownUserController.getAllUsers);

/**
 * POST /known-users
 * Create a new KnownUser or associate with existing one
 */
router.post("/", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), knownUserController.createKnownUser);

/**
 * GET /known-users/search
 * Search KnownUsers by phone or email globally or by company
 */
router.get("/search", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), knownUserController.searchKnownUsers);

/**
 * GET /known-users
 * List KnownUsers (globally or filtered by companyId)
 */
router.get("/", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), knownUserController.listKnownUsers);

/**
 * GET /known-users/:id
 * Get a specific KnownUser by ID
 */
router.get("/:id", authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']), knownUserController.getKnownUser);

/**
 * PUT /known-users/:id
 * Update a KnownUser
 */
router.put(
  "/:id",
  authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']),
  knownUserController.updateKnownUser
);

/**
 * DELETE /known-users/:id
 * Deactivate (soft delete) a KnownUser
 */
router.delete(
  "/:id",
  authenticateToken, requireRole(['super_admin', 'company_admin', 'worker']),
  knownUserController.deactivateKnownUser
);

module.exports = router;
