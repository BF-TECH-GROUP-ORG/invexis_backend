const express = require("express");
const app = express();
<<<<<<< HEAD
const PORT = process.env.PORT || 8011;
app.get("/health", (req, res) => res.sendStatus(200));

app.get("/", (req, res) => res.send("Hello from debit-service!"));
=======
const PORT = process.env.PORT || 8005;
const router = require('./routes/debt')
app.get('/health', (req, res) => res.sendStatus(200));

app.use('/debt' , router)
>>>>>>> ce9cc58373456b16292975932d180f8fad336166
app.listen(PORT, () => console.log(`sales-service running on port ${PORT}`));
