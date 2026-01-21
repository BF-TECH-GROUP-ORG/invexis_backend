const express = require("express");
const router = express.Router();
const shopController = require("../controllers/ShopController");
const operatingHoursController = require("../controllers/ShopOperatingHoursController");
const { authenticateToken } = require('/app/shared/middlewares/auth/production-auth');
const { checkSubscriptionStatus } = require('/app/shared/middlewares/subscription/production-subscription');

// 🔒 Global Shop Service Protection
router.use(authenticateToken);
router.use(checkSubscriptionStatus());

router.post("/", shopController.createShop);
router.get("/", shopController.getShops);
router.get("/search", shopController.searchShops);
router.get("/:id", shopController.getShopById)
router.patch("/:id", shopController.updateShop);
router.patch("/:id/status", shopController.changeShopStatus);
router.delete("/:id", shopController.deleteShop);

// ✅ Operating Hours Routes (Event-driven)
router.get("/:shopId/operating-hours", operatingHoursController.getOperatingHours);
router.put("/:shopId/operating-hours", operatingHoursController.setOperatingHours);
router.patch("/:shopId/operating-hours/:dayOfWeek", operatingHoursController.updateDayHours);
router.delete("/:shopId/operating-hours", operatingHoursController.clearOperatingHours);
router.get("/:shopId/is-open", operatingHoursController.checkShopOpen);


module.exports = router;
