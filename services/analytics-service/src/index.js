const express = require("express");
const app = express();
<<<<<<< HEAD
const PORT = process.env.PORT || 8009;
app.get("/health", (req, res) => res.sendStatus(200));
app.get("/", (req, res) => res.send("Hello from analytics-service!"));
app.listen(PORT, () =>
  console.log(`analytics-service running on port ${PORT}`)
);
=======
const PORT = process.env.PORT || 8002;
const router = require('./routes/analytics')
app.get('/health', (req, res) => res.sendStatus(200));
app.use('/analytics', router)
app.listen(PORT, () => console.log(`analytics-service running on port ${PORT}`));
>>>>>>> ce9cc58373456b16292975932d180f8fad336166
