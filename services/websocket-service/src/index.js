require("dotenv").config();
const express = require("express");
const app = express();
const routes = require("./routes/routes");

app.use(express.json());

app.use("/websocket", routes);

const PORT = process.env.PORT || 9002;

app.listen(PORT, () => {
    console.log(`websocket service running on ${PORT}`);
});
app.get('/health', (req, res) => res.sendStatus(200));
