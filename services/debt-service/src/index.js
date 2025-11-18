const express = require("express");
const app = express();
const PORT = process.env.PORT || 8005;
const router = require('./routes/debt')
app.get('/health', (req, res) => res.sendStatus(200));

app.use('/debt' , router)
app.listen(PORT, () => console.log(`sales-service running on port ${PORT}`));
