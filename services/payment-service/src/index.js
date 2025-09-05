const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Hello from payment-service!'));
app.listen(PORT, () => console.log(`payment-service running on port ${PORT}`));
