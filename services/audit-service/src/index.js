const express = require("express");
const app = express();
<<<<<<< HEAD
const PORT = process.env.PORT || 8010;
app.get("/", (req, res) => res.send("Hello from audit-service!"));
=======
const PORT = process.env.PORT || 8003;
const router = require('./routes/audit')

app.use('/audit', router)

>>>>>>> ce9cc58373456b16292975932d180f8fad336166
app.listen(PORT, () => console.log(`audit-service running on port ${PORT}`));
app.get("/health", (req, res) => res.sendStatus(200));
