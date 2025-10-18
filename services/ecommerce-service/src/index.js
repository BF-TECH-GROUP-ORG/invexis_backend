require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(express.json());

// Connect to DB
connectDB();


const ecommerceRoute = require('./routes/ecommerceRoute');
app.use('/ecommerce', ecommerceRoute);

app.get('/', (req, res) => res.send('Hello from ecommerce-service!'));
app.get('/health', (req, res) => res.sendStatus(200));

app.listen(PORT, () => console.log(`ecommerce-service running on port ${PORT}`));
