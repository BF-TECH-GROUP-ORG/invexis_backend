require("dotenv").config();
const express = require("express");
const app = express();
app.get("/", (req, res) => {
  res.send("Shop Service is running");
});
const PORT = process.env.PORT || 4009;
app.listen(PORT, () => {
  console.log(`Shop Service running on port ${PORT}`);
});
app.get('/health', (req, res) => res.sendStatus(200));