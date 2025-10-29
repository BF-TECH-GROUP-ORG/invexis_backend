const express = require('express');
const productRoutes = require('./productRoutes');
const stockChangeRoutes = require('./stockChangeRoutes');
const inventoryAdjustmentRoutes = require('./inventoryAdjustmentRoutes');
const reportRoutes = require('./reportRoutes');
//const favoriteRoutes = require('./favoriteRoute');
const discountRoutes = require('./discountRoutes');
const alertRoutes = require('./alertRoutes');
const categoryRoutes = require('./categoryRoutes');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: "inventory service routed to gateway" })
})

router.use('/v1/products', productRoutes);
router.use('/v1/stock-changes', stockChangeRoutes);
router.use('/v1/discounts', discountRoutes);
router.use('/v1/alerts', alertRoutes);
router.use('/v1/categories', categoryRoutes);
router.use('/v1/report', reportRoutes)
router.use('v1/inventory-adjustment', inventoryAdjustmentRoutes)

module.exports = router;