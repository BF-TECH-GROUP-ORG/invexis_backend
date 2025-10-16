const express = require('express');
const productRoutes = require('./productRoutes');
const stockChangeRoutes = require('./stockChange');
const favoriteRoutes = require('./favoriteRoute');
const discountRoutes = require('./discountRoute');
const alertRoutes = require('./alertRoute');
const categoryRoutes = require('./categoryRoute');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: "inventory service routed to gateway" })
})

router.use('/v1/products', productRoutes);
router.use('/v1/stock-changes', stockChangeRoutes);
router.use('/v1/favorites', favoriteRoutes);
router.use('/v1/discounts', discountRoutes);
router.use('/v1/alerts', alertRoutes);
router.use('/v1/categories', categoryRoutes);

module.exports = router;