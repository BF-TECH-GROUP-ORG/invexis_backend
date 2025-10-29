const express = require("express");
const router = express.Router();
const shopController = require("../controllers/ShopController");
const departmentController = require("../controllers/ShopDepartmentController");

// Shop routes
router.post("/", shopController.createShop);
router.get("/", shopController.getShops);
router.get("/search", shopController.searchShops);
router.get("/:id", shopController.getShopById);
router.patch("/:id", shopController.updateShop);
router.patch("/:id/status", shopController.changeShopStatus);
router.delete("/:id", shopController.deleteShop);

// Department routes
router.post("/:shopId/departments", departmentController.createDepartment);
router.get("/:shopId/departments", departmentController.getDepartments);
router.get(
  "/:shopId/departments/:deptId",
  departmentController.getDepartmentById
);
router.patch(
  "/:shopId/departments/:deptId",
  departmentController.updateDepartment
);
router.delete(
  "/:shopId/departments/:deptId",
  departmentController.deleteDepartment
);

module.exports = router;
