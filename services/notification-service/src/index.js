const express = require("express");
const app = express();
const PORT = process.env.PORT || 8008;
<<<<<<< HEAD
// in notification-service app
app.get("/health", (req, res) => res.sendStatus(200));

app.get("/", (req, res) => res.send("Hello from notification-service!"));
app.listen(PORT, () =>
  console.log(`notification-service running on port ${PORT}`)
);
=======
const router = require('./routes/notification')
// in notification-service app
app.get('/health', (req, res) => res.sendStatus(200));
app.use('/notification', router)
app.listen(PORT, () => console.log(`notification-service running on port ${PORT}`));
>>>>>>> ce9cc58373456b16292975932d180f8fad336166
