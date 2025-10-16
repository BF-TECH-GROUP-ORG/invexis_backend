const express = require("express");
const app = express();
const PORT = process.env.PORT || 8007;
app.get("/", (req, res) => res.send("Hello from ecommerce-service!"));
app.listen(PORT, () =>
  console.log(`ecommerce-service running on port ${PORT}`)
);

app.get("/health", (req, res) => res.sendStatus(200));
