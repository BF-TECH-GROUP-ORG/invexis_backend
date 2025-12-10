const express = require("express");
const router = express.Router();
const AuditController = require("../controllers/AuditController");

router.get("/logs", AuditController.getLogs);
router.get("/logs/:id", AuditController.getLogDetails);

module.exports = router;
