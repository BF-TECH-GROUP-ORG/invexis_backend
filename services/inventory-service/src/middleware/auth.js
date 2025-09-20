const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('No token provided');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.companyId) throw new Error('Invalid token: companyId missing');
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn(`Auth error: ${error.message}`);
    res.status(401).json({ error: error.message });
  }
};

module.exports = { authMiddleware };