require('dotenv').config();
const express = require('express');
const app = express();
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const authMiddleware = require('./middleware/authMiddleware');
const errorHandler = require('./utils/errorHandler');
const setupRoutes = require('./routes/routes');

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
// app.use(authMiddleware);
setupRoutes(app);
app.use(errorHandler);

app.get('/', (req, res) => {
    res.json({ message: 'API Gateway is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});

