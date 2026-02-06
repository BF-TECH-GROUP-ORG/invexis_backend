const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireCompanyAccess,authenticateToken,requireRole } = require('/app/shared/middlewares/auth/production-auth');


router.get('/',(req,res)=>{
    res.json({message:"Report Service is running"})
})

// Apply Company Access Shield to ALL routes in this file
// router.use(requireCompanyAccess);

// ==========================================
// 1. Executive Dashboard (High Speed)
// ==========================================
router.get('/executive/overview', reportController.getExecutiveOverview);

// ==========================================
// 2. Hierarchical Reports (General)
// ==========================================
router.get('/general/company/:companyId', reportController.getCompanyGeneralReport);
router.get('/general/shop/:shopId', reportController.getShopGeneralReport);

// ==========================================
// 3. Inventory Reports (Dedicated Intelligence)
// ==========================================
const inventoryController = require('../controllers/inventoryController');
router.get('/inventory/company/:companyId', inventoryController.getCompanyInventoryReport);
router.get('/inventory/shop/:shopId', inventoryController.getShopInventoryReport);
router.get('/inventory/shop/:shopId/export', inventoryController.exportShopInventory); // Added Export Route


// ==========================================
// 4. Sales Reports (Detailed Transaction Log)
// ==========================================

const salesController = require('../controllers/salesController');
router.get('/sales/company/:companyId', salesController.getDetailedSalesReport);
router.get('/sales/company/:companyId/export', salesController.exportSales); // Added Export Route
router.get('/sales/shop/:shopId', salesController.getShopDetailedSalesReport);

// ==========================================
// 5. Debt Reports (Intelligent Aging)
// ==========================================
const debtController = require('../controllers/debtController');
router.get('/debt/company/:companyId', debtController.getDetailedDebtReport);
router.get('/debt/shop/:shopId', debtController.getShopDetailedDebtReport);
router.get('/debt/shop/:shopId/export', debtController.exportShopDebt); // Added Export Route

// ==========================================
// 6. Payment Reports (Money Trail)
// ==========================================
const paymentController = require('../controllers/paymentController');
router.get('/payment/company/:companyId', paymentController.getDetailedPaymentReport);
router.get('/payment/shop/:shopId', paymentController.getShopDetailedPaymentReport);
router.get('/payment/shop/:shopId/export', paymentController.exportShopPayments); // Added Export Route

// ==========================================
// 7. Performance Reports (People & Places)
// ==========================================
const performanceController = require('../controllers/performanceController');
router.get('/performance/branches/company/:companyId', performanceController.getBranchPerformance);
router.get('/performance/branches/shop/:shopId', performanceController.getShopPerformance);
router.get('/performance/staff/company/:companyId', performanceController.getStaffPerformance);
router.get('/performance/staff/shop/:shopId', performanceController.getShopStaffPerformance);
router.get('/performance/export/:companyId', performanceController.exportPerformance); // Branded Export


// ==========================================
// 8. Business Intelligence (Visual Charts)
// ==========================================
const biController = require('../controllers/biController');
router.get('/bi/performance/company/:companyId', biController.getBusinessPerformance);
router.get('/bi/performance/company/:companyId/export', biController.exportPerformanceOverview); // Branded Export

router.get('/bi/performance/shop/:shopId', async (req, res) => {
    // Reuse controller but map params. 
    // Wait, controller uses req.params.companyId and req.query.shopId. 
    // Let's just create a quick wrapper in controller or modify the controller to prioritize params.shopId
    // Actually simpler: Just add a getShopBusinessPerformance in controller.
    // Logic: req.query.shopId is superseded by req.params.shopId
    req.query.shopId = req.params.shopId;
    return biController.getBusinessPerformance(req, res);
});

module.exports = router;
