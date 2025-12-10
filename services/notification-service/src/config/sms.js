// src/config/sms.js
const twilio = require('twilio');
const logger = require('../utils/logger');

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

module.exports = client;