const express = require('express');
const app = express();
const PORT = process.env.PORT || 3005;
app.get('/', (req, res) => res.send('Hello from sales-service!'));
app.get('/health', (req, res) => res.sendStatus(200));
app.listen(PORT, () => console.log(`sales-service running on port ${PORT}`));
