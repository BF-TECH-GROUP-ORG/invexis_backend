const express = require("express");
const app = express();
<<<<<<< HEAD
const PORT = process.env.PORT || 8007;
app.get("/", (req, res) => res.send("Hello from ecommerce-service!"));
app.listen(PORT, () =>
  console.log(`ecommerce-service running on port ${PORT}`)
);

app.get("/health", (req, res) => res.sendStatus(200));
=======
const PORT = process.env.PORT || 8006;
const router = require('./routes/eccomm')
app.use('/ecommerce', router)

app.listen(PORT, () => console.log(`ecommerce-service running on port ${PORT}`));
app.get('/health', (req, res) => res.sendStatus(200));
>>>>>>> ce9cc58373456b16292975932d180f8fad336166
