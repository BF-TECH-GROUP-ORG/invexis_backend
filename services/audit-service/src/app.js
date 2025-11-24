const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const router = require('./routes/audit');
app.use('/audit', router);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

module.exports = app;
