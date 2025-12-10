const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/eventController');

router.post('/publish', ctrl.publishEvent);

module.exports = router;
