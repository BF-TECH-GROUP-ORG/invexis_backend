const authService = require('../services/authService');
const tokenService = require('../services/tokenService');

exports.register = async (req, res) => {
    try {
        const user = await authService.register(req.body);
        const { accessToken, refreshToken } = tokenService.generateTokens(user._id, user);
        res.status(201).json({ user, accessToken, refreshToken });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { identifier, password, companyAdminPhone } = req.body;
        if (!identifier || !password) throw new Error('Identifier and password are required');
        const user = await authService.login({ identifier, password, companyAdminPhone });
        const { accessToken, refreshToken } = tokenService.generateTokens(user._id, user);
        res.json({ user, accessToken, refreshToken });
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};

exports.loginWithFingerprint = async (req, res) => {
    try {
        const { fingerprint } = req.body;
        if (!fingerprint) throw new Error('Fingerprint is required');
        const user = await authService.login({ fingerprint });
        const { accessToken, refreshToken } = tokenService.generateTokens(user._id, user);
        res.json({ user, accessToken, refreshToken });
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};