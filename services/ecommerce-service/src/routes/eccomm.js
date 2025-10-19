const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.json({ message: "ecommerce service is routed to the gateway" })
})

module.exports = router