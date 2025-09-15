const express = require('express');
const cors = require('cors');
const morgan = require('morgan'); // logging middleware
const helmet = require('helmet'); // security headers
const rateLimit = require('express-rate-limit'); // basic rate limiting
const authRoutes = require('./routes/authRoutes');

const app = express();

// ----------- MIDDLEWARE ------------

// Security headers
app.use(helmet());

// Enable CORS for all origins (adjust origin in production)
app.use(cors({
    origin: '*', // for production, replace '*' with allowed domains
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON parsing
app.use(express.json({ limit: '10mb' })); // increase payload limit if fingerprints are large
app.use(express.urlencoded({ extended: true }));

// Logging (optional)
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// ----------- ROUTES ------------

app.use('/auth', authRoutes);
app.get('/health', (req, res) => res.sendStatus(200));

// Optional: protected test route
// const { protect } = require('./middleware/authMiddleware');
// app.get('/protected', protect, (req, res) => res.json({ message: 'You are authorized!' }));

// ----------- ERROR HANDLING ------------

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

module.exports = app;
