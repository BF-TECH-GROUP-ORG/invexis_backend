const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Skip auth routes (login/register handled by Auth Service)
    if (req.path.startsWith('/auth')) return next();

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization header missing or malformed' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256'],               // enforce algorithm
            issuer: process.env.JWT_ISSUER,      // verify token issuer
            audience: process.env.JWT_AUDIENCE,  // verify token audience
        });

        // Attach safe payload to request
        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
        };

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired, please login again' });
        }
        return res.status(403).json({ message: 'Invalid token' });
    }
};
