const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Hello from audit-service!'));
app.listen(PORT, () => console.log(`audit-service running on port ${PORT}`));
app.get('/health', (req, res) => res.sendStatus(200));
