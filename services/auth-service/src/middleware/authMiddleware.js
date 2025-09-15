const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User.models');

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) return res.status(401).json({ message: 'Not authorized' });

    try {
        const decoded = verifyAccessToken(token);
        req.user = await User.findById(decoded.id).select('-passwordHash -twoFASecret');
        next();
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};

module.exports = { protect };