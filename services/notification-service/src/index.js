const express = require('express');
const app = express();
const PORT = process.env.PORT || 8008;
const router = require('./routes/notification')
// in notification-service app
app.get('/health', (req, res) => res.sendStatus(200));
app.use('/notification', router)
app.listen(PORT, () => console.log(`notification-service running on port ${PORT}`));
