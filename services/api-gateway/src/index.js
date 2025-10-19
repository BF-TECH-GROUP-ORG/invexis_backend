const app = require('./app');
const morgan = require('morgan');

const PORT = process.env.PORT || 8000;

app.use(morgan('dev'))

app.get('/', (req, res) => {
    res.json({ message: 'Api gateway is running' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
});