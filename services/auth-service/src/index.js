require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 4001;

app.get('/', (req, res) => res.json({ message: 'Hello from auth-service!' }));

// Add this route to handle /auth
app.get('/auth', (req, res) => {
    res.json({ message: 'Auth service is working!' });
});
app.get('/auth/login', (req, res) => {
    res.json({ message: 'Login endpoint' });
});
app.get('/auth/register', (req, res) => {
    res.json({ message: 'Register endpoint' });
});

app.listen(PORT, () => {
    console.log(`auth-service running on port http://localhost:${PORT}`)
});