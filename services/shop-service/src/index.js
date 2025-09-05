require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const shopRoutes = require("./routes/shopRoutes");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/api/shops", shopRoutes);

const PORT = process.env.PORT || 4009;
app.listen(PORT, () => {
  console.log(`Shop Service running on port ${PORT}`);
});