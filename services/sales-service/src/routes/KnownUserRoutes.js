const express = require("express");
const router = express.Router();
const knownUserController = require("../controllers/KnownUserController");

/**
 * POST /known-users
 * Create a new KnownUser
 */
router.post("/", knownUserController.createKnownUser);

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
router.put("/:id", knownUserController.updateKnownUser);

/**
 * DELETE /known-users/:id
 * Deactivate (soft delete) a KnownUser
 */
router.delete("/:id", knownUserController.deactivateKnownUser);

module.exports = router;
