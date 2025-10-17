require("dotenv").config();
const express = require("express");
const router = require("./routes/shop");
const PORT = process.env.PORT || 9001;
const app = express();

app.use(express.json());

app.use("/shop", router);

app.listen(PORT, () => {
  console.log(`Shop Service running on port ${PORT}`);
});
app.get('/health', (req, res) => res.sendStatus(200));