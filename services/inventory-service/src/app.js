const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const errorMiddleware = require('./middleware/error');
const router = require('./routes/index')
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/inventory', router);


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
