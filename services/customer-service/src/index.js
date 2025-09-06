require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 4001;
app.get('/', (req, res) => res.json({ message: 'Hello from auth-service!' }));
app.listen(PORT, () => console.log(`auth-service running on port ${PORT}`));
