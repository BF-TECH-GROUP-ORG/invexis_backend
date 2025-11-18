const express = require('express');
const path = require('path');
const compression = require('compression');
const metrics = require('./utils/metrics');
const app = express();

app.use(compression({ level: 6, filter: (req, res) => req.headers['x-no-compression'] ? false : compression.filter(req, res) }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Response time middleware - set header before sending, log after, record metrics
app.use((req, res, next) => {
    const start = process.hrtime.bigint();

    // Intercept res.end/json/send to add header before sending
    const originalEnd = res.end;
    const originalJson = res.json;

    res.end = function (...args) {
        const diff = process.hrtime.bigint() - start;
        const ms = Number(diff) / 1e6;
        if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${ms.toFixed(3)}ms`);
        }
        console.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms.toFixed(3)} ms`);
        metrics.recordResponseTime(ms);
        return originalEnd.apply(res, args);
    };

    res.json = function (data) {
        const diff = process.hrtime.bigint() - start;
        const ms = Number(diff) / 1e6;
        if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${ms.toFixed(3)}ms`);
        }
        console.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms.toFixed(3)} ms`);
        metrics.recordResponseTime(ms);
        return originalJson.call(res, data);
    };

    next();
});

// Routes
const debtRouter = require('./routes/debt');
const analyticsRouter = require('./routes/analytics');
const eventsRouter = require('./routes/events');

app.use('/debt', debtRouter);
app.use('/debt/analytics', analyticsRouter);
app.use('/events', eventsRouter);

// Health
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
    try {
        const metricsText = metrics.getMetricsText();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(metricsText);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Monitoring endpoint: check Redis queue depth and in-memory store status
app.get('/monitoring/queue', async (req, res) => {
    try {
        const inMemoryStore = require('./utils/inMemoryStore');
        const queueLength = inMemoryStore.queueLength();
        const debtsInMemory = inMemoryStore.debts.size;
        const repaymentsInMemory = inMemoryStore.repayments.size;

        // Update metrics gauges
        metrics.updateQueueDepth(queueLength);
        metrics.updateInMemoryDebts(debtsInMemory);
        metrics.updateInMemoryRepayments(repaymentsInMemory);

        res.json({
            writeQueueLength: queueLength,
            debtsInMemory,
            repaymentsInMemory,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = app;
