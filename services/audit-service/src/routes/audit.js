const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.json({ message: "audit service is routed to gateway" })
})

module.exports = router