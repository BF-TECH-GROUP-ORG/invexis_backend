const express = require("express");
const app = express();
const PORT = process.env.PORT || 8002;
const router = require('./routes/analytics')
app.get('/health', (req, res) => res.sendStatus(200));
app.use('/analytics', router)
app.listen(PORT, () => console.log(`analytics-service running on port ${PORT}`));
