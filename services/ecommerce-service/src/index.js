const express = require('express');
const app = express();
const PORT = process.env.PORT || 8006;
const router = require('./routes/eccomm')
app.use('/ecommerce', router)

app.listen(PORT, () => console.log(`ecommerce-service running on port ${PORT}`));
app.get('/health', (req, res) => res.sendStatus(200));