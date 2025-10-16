const express = require("express");
const app = express();
const PORT = process.env.PORT || 8011;
app.get("/health", (req, res) => res.sendStatus(200));

app.get("/", (req, res) => res.send("Hello from debit-service!"));
app.listen(PORT, () => console.log(`sales-service running on port ${PORT}`));
