const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    // Skip auth routes and health checks
    if (req.path.startsWith('/api/auth') || req.path === '/health') {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE,
        });

        // Attach safe payload to request
        // Attach safe payload to request
        req.user = {
            id: decoded.id || decoded.sub, // Handle 'sub' vs 'id' variance
            email: decoded.email,
            role: decoded.role,
            companies: decoded.companies || [],
            shops: decoded.shops || []
        };

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired, please login again' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
};

module.exports = { authenticateToken };