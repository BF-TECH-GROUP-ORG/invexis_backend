const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/health', (req, res) => res.sendStatus(200));
app.get('/', (req, res) => res.send('Hello from company-service!'));
app.listen(PORT, () => console.log(`company-service running on port ${PORT}`));
