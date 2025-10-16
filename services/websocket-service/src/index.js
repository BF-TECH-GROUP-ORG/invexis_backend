const express = require("express");
const app = express();
const PORT = process.env.PORT || 8012;

app.get("/health", (req, res) => res.sendStatus(200));
app.get("/", (req, res) => res.send("Hello from websocket-service!"));

app.listen(PORT, () =>
  console.log(`websocket-service running on port ${PORT}`)
);
