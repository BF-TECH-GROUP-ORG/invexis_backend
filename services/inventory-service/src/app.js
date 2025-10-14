const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const errorMiddleware = require('./middleware/error');
const productRoutes = require('./routes/productRoutes');
const stockChangeRoutes = require('./routes/stockChangeRoutes');
const discountRoutes = require('./routes/discountRoutes');
const alertRoutes = require('./routes/alertRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const inventoryAdjustmentRoutes = require('./routes/inventoryAdjustmentRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes')
const logger = require('./utils/logger');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/stock-changes', stockChangeRoutes);
app.use('/api/v1/discounts', discountRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/report', reportRoutes);
app.use('/api/v1/inventory-adjustment', inventoryAdjustmentRoutes);
app.use('/api/v1/warehouse', warehouseRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorMiddleware);

module.exports = app;