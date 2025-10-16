const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const errorMiddleware = require("./middleware/error");
const productRoutes = require("./routes/productRoutes");
const stockChangeRoutes = require("./routes/stockChangeRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const discountRoutes = require("./routes/discountRoutes");
const alertRoutes = require("./routes/alertRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const logger = require("./utils/logger");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/stock-changes", stockChangeRoutes);
app.use("/api/v1/favorites", favoriteRoutes);
app.use("/api/v1/discounts", discountRoutes);
app.use("/api/v1/alerts", alertRoutes);
app.use("/api/v1/categories", categoryRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorMiddleware);

// Start server
const PORT = process.env.PORT || 8004;
app.listen(PORT, () => {
  logger.info(`Inventory Service running on port ${PORT}`);
});

module.exports = app;
