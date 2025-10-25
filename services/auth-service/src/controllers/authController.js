// authController.js
const authService = require('../services/authService');
const tokenService = require('../services/tokenService');
const LoginHistory = require('../models/LoginHistory.models');
const { uploadProfileImage } = require('../middleware/upload');

// Register a new user
const register = async (req, res) => {
    const options = { ip: req.ip, device: req.get('User-Agent'), location: req.location || {} };
    const result = await authService.register(req.body, options);

    // If result has an error (indicated by status and message)
    if (result.status && result.message) {
        return res.status(result.status).json({ ok: false, message: result.message });
    }

    // If successful (has user object)
    if (result.user) {
        return res.status(201).json({
            ok: true,
            user: result.user,
            verificationTokens: process.env.NODE_ENV !== 'production' ? result.verificationTokens : []
        });
    }

    // Fallback for unexpected response
    res.status(500).json({ ok: false, message: 'Unexpected server error' });
};

// Login with credentials
const login = async (req, res) => {
    const options = { ip: req.ip, device: req.get('User-Agent'), location: req.location || {} };
    const result = await authService.login(req.body, options);

    // If there's an error response
    if (result.status && result.message) {
        return res.status(result.status || 400).json({ ok: false, message: result.message });
    }

    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    });
    res.json({ ok: true, accessToken: result.accessToken, user: result.user });
};

// Request OTP for login
const requestOtpLogin = async (req, res) => {
    try {
        const options = { ip: req.ip, device: req.get('User-Agent'), location: req.location || {} };
        const result = await authService.requestOtpLogin(req.body.identifier, options);

        if (!result.ok) {
            return res.status(result.status || 400).json({ ok: false, message: result.message });
        }

        res.status(200).json({ ok: true, message: 'OTP sent successfully' });
    } catch (err) {
        console.error('Error in requestOtpLogin:', err);
        res.status(500).json({ ok: false, message: 'Internal server error' });
    }
};

// Verify OTP for login
const verifyOtpLogin = async (req, res) => {
    const { identifier, code } = req.body;
    const options = { ip: req.ip, device: req.get('User-Agent'), location: req.location || {} };
    const result = await authService.verifyOtpLogin(identifier, code, options);

    if (!result.ok) {
        return res.status(result.status).json({ ok: false, message: result.message });
    }

    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    });
    res.json({ ok: true, accessToken: result.accessToken, user: result.user });
};

// Google OAuth callback
const googleCallback = async (req, res, next) => {
    if (!req.user) return res.redirect('/login?error=google');
    try {
        const options = { ip: req.ip, device: req.get('User-Agent'), location: req.location || {} };
        const { refreshToken, session } = await tokenService.createSession(req.user._id, options.device, options.ip, options.location);
        req.user.sessions.push(session._id);
        req.user.lastLoginAt = new Date();
        await req.user.save();
        const loginHistory = new LoginHistory({
            userId: req.user._id,
            ip: options.ip,
            device: options.device,
            location: options.location,
            method: 'google',
            successful: true,
            riskScore: 0
        });
        await loginHistory.save();
        req.user.loginHistory.push(loginHistory._id);
        await req.user.save();
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
        });
        res.redirect('/dashboard');
    } catch (err) {
        next(err);
    }
};

// Refresh access token
const refresh = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
        if (!refreshToken) return res.status(400).json({ ok: false, message: 'No refresh token' });
        const tokens = await authService.refresh(refreshToken);
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
        });
        res.json({ ok: true, accessToken: tokens.accessToken });
    } catch (err) {
        next(err);
    }
};

// Logout
const logout = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
        await authService.logout(req.user ? req.user._id : null, refreshToken);
        res.clearCookie('refreshToken');
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
};

// Verify email/phone
const verify = async (req, res) => {
    const userId = req.params.userId || (req.user && req.user._id);
    const result = await authService.verify(userId, req.body);

    if (!result.ok) {
        return res.status(result.status).json({ ok: false, message: result.message });
    }

    res.json({ ok: true, verified: result.verified });
};

// Setup 2FA
const setup2FA = async (req, res, next) => {
    try {
        const out = await authService.setup2FA(req.user._id);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Verify 2FA setup
const verify2FASetup = async (req, res, next) => {
    try {
        const out = await authService.verify2FASetup(req.user._id, req.body);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Disable 2FA
const disable2FA = async (req, res, next) => {
    try {
        const out = await authService.disable2FA(req.user._id, req.body.otp);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Request email change
const changeEmail = async (req, res, next) => {
    try {
        const { newEmail, currentPassword } = req.body;
        const options = { ip: req.ip, device: req.get('User-Agent'), location: req.location || {} };
        const out = await authService.changeEmail(req.user._id, newEmail, currentPassword, options);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Confirm email change
const confirmChangeEmail = async (req, res, next) => {
    try {
        const out = await authService.confirmChangeEmail(req.user._id, req.body);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Request password reset
const requestPasswordReset = async (req, res, next) => {
    try {
        const { identifier } = req.body;
        const out = await authService.requestPasswordReset(identifier);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Confirm password reset
const confirmPasswordReset = async (req, res, next) => {
    try {
        const { identifier, code, newPassword } = req.body;
        const out = await authService.confirmPasswordReset(identifier, code, newPassword);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Change password
const changePassword = async (req, res, next) => {
    try {
        const out = await authService.changePassword(req.user._id, req.body);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Delete account
const deleteAccount = async (req, res, next) => {
    try {
        const out = await authService.deleteAccount(req.user._id);
        res.clearCookie('refreshToken');
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Revoke consent
const revokeConsent = async (req, res, next) => {
    try {
        const { type } = req.body;
        const out = await authService.revokeConsent(req.user._id, type);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Unlock account (admin)
const unlockAccount = async (req, res, next) => {
    try {
        const { id } = req.params;
        const out = await authService.unlockAccount(req.user._id, id);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Bulk update users (admin)
const bulkUpdateUsers = async (req, res, next) => {
    try {
        const { userIds, action } = req.body;
        const out = await authService.bulkUpdateUsers(userIds, action);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Check consent compliance (admin)
const checkConsentCompliance = async (req, res, next) => {
    try {
        const { termsVersion, privacyVersion } = req.query;
        const out = await authService.checkConsentCompliance(termsVersion, privacyVersion);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Get user sessions
const getSessions = async (req, res, next) => {
    try {
        const out = await authService.getSessions(req.user._id);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Revoke a session
const revokeSession = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const out = await authService.revokeSession(req.user._id, sessionId);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Get user consents
const getConsents = async (req, res, next) => {
    try {
        const out = await authService.getConsents(req.user._id);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Update profile with optional profile picture upload
const updateProfile = async (req, res, next) => {
    try {
        const profilePictureUrl = req.profilePictureUrl || null;
        const out = await authService.updateProfile(req.user._id, req.body, profilePictureUrl);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Resend verification
const resendVerification = async (req, res, next) => {
    try {
        const { type } = req.params;
        const out = await authService.resendVerification(req.user._id, type);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Get users (admin)
const getUsers = async (req, res, next) => {
    try {
        const out = await authService.getUsers(req.user._id, req.user.role, req.query);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Create user (admin)
const createUser = async (req, res, next) => {
    try {
        const options = { ip: req.ip, device: req.get('User-Agent'), location: req.location || {} };
        const out = await authService.createUser(req.user._id, req.body, options);
        res.status(201).json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Update user (admin)
const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const out = await authService.updateUser(req.user._id, id, req.body);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Delete user (admin)
const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const out = await authService.deleteUser(req.user._id, id);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Get user by ID (admin)
const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const out = await authService.getUserById(req.user._id, id);
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

// Accept consent
const acceptConsent = async (req, res, next) => {
    try {
        const out = await authService.acceptConsent(req.user._id, {
            ...req.body,
            ip: req.ip,
            device: req.get('User-Agent')
        });
        res.json({ ok: true, ...out });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    register,
    login,
    requestOtpLogin,
    verifyOtpLogin,
    googleCallback,
    refresh,
    logout,
    verify,
    setup2FA,
    verify2FASetup,
    disable2FA,
    changeEmail,
    confirmChangeEmail,
    requestPasswordReset,
    confirmPasswordReset,
    changePassword,
    deleteAccount,
    revokeConsent,
    unlockAccount,
    bulkUpdateUsers,
    checkConsentCompliance,
    getSessions,
    revokeSession,
    getConsents,
    updateProfile,
    resendVerification,
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    getUserById,
    acceptConsent
};