const express = require('express')
const router = express.Router()
const { processPayment } = require('../controllers/paymentController')

router.get("/", (req, res) => {
  res.json({ message: "Payment Service is running." });
});

router.post('/pay', processPayment)
module.exports = router