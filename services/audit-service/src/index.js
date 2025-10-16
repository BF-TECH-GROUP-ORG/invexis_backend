const express = require('express');
const app = express();
const PORT = process.env.PORT || 8003;
const router = require('./routes/audit')

app.use('/audit', router)

app.listen(PORT, () => console.log(`audit-service running on port ${PORT}`));
app.get('/health', (req, res) => res.sendStatus(200));
