require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const router = require("./routes/SalesRoutes");
const PORT = process.env.PORT || 3005;
const app = express();
app.use(bodyParser.json());

app.use("/sales", router);

app.listen(PORT, () => {
  console.log("Sales service running on port 3000");
});
