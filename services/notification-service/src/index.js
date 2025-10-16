const express = require("express");
const app = express();
const PORT = process.env.PORT || 8008;
// in notification-service app
app.get("/health", (req, res) => res.sendStatus(200));

app.get("/", (req, res) => res.send("Hello from notification-service!"));
app.listen(PORT, () =>
  console.log(`notification-service running on port ${PORT}`)
);
