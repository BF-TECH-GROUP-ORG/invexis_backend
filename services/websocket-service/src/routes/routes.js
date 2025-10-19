const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.send("WebSocket Service is routed to gateway");
});

module.exports = router;