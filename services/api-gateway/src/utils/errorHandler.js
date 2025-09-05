
module.exports = (err, req, res, next) => {
    console.error('Gateway Error:', err);
    res.status(503).json({ message: 'Service Unavailable', details: err.message });
}