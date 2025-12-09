const express = require("express");
const router = express.Router();
const AnalyticsController = require("../controllers/AnalyticsController");

router.get("/events/types", AnalyticsController.getEventTypes);
router.get("/stats", AnalyticsController.getEventStats);

module.exports = router;
