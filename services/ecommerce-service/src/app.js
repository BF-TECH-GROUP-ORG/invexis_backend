const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Routes
const ecommerceRoute = require('./routes/ecommerceRoute');
app.use('/ecommerce', ecommerceRoute);

// Health and root endpoints
app.get('/', (req, res) => res.send('Hello from ecommerce-service!'));
app.get('/health', (req, res) => res.sendStatus(200));

// Export the Express app
module.exports = app;