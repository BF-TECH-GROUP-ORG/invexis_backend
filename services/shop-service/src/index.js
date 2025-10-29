require("dotenv").config();
const express = require("express");
const router = require("./routes/shop");
const PORT = process.env.PORT || 9001;
const app = express();
<<<<<<< HEAD
app.get("/", (req, res) => {
  res.send("Shop Service is running");
});
const PORT = process.env.PORT || 8003;
=======

app.use(express.json());

app.use("/shop", router);

>>>>>>> ce9cc58373456b16292975932d180f8fad336166
app.listen(PORT, () => {
  console.log(`Shop Service running on port ${PORT}`);
});
app.get("/health", (req, res) => res.sendStatus(200));
