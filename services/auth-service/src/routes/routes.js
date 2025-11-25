// authRoutes.js
const express = require('express');
const passport = require('passport');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const tokenService = require('../services/tokenService');
const { uploadProfileImage } = require('../middleware/upload');
const {
    requireAuth,
    requireRole,
} = require('../middleware/authMiddleware');
const {
    corsForAuth,
    rateLimitByUser,
    checkTokenBlacklist,
    checkConsent,
    deviceFingerprint,
    enforce2FA,
} = require('/app/shared/middlewares/auth/auth');

// Apply CORS to all auth routes
router.use(corsForAuth);

// Rate limiting for public routes (100 req/hour per user/IP)
const loginRateLimit = rateLimitByUser(100, 3600000); // 1 hour window

/**
 * Public Routes - No Authentication Required
 */

// Health check
router.get('/', (req, res) => {
    res.json({ message: "auth service is routed to the gateway" });
});

// Registration and Basic Auth
router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

// OTP Authentication
router.post('/login/otp/request', loginRateLimit, authCtrl.requestOtpLogin);
router.post('/login/otp/verify', loginRateLimit, authCtrl.verifyOtpLogin);

// Password Reset
router.post('/password/reset', loginRateLimit, authCtrl.requestPasswordReset);
router.post('/password/reset/confirm', loginRateLimit, authCtrl.confirmPasswordReset);

/**
 * Google OAuth Routes
 */
// Sign up with Google (new accounts)
router.get('/google/signup', (req, res, next) => {
    req.session.authType = 'signup';
    next();
}, passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));

// Sign in with Google (existing accounts)
router.get('/google/signin', (req, res, next) => {
    req.session.authType = 'signin';
    next();
}, passport.authenticate('google', {
    scope: ['profile', 'email']
}));

// Google OAuth callback handler
router.get('/google/callback',
    (req, res, next) => {
        console.log('Google callback received:', {
            query: req.query,
            authType: req.session.authType
        });
        next();
    },
    (req, res, next) => {
        passport.authenticate('google', async (err, user, info) => {
            console.log('Passport authenticate callback:', { err, user: !!user, info });

            if (err) {
                console.error('Google auth error:', err);
                return res.status(500).json({
                    ok: false,
                    error: 'google_auth_error',
                    message: err.message
                });
            }

            if (!user) {
                console.log('No user from Google auth:', info);
                return res.status(401).json({
                    ok: false,
                    error: 'authentication_failed',
                    message: info?.message || 'Authentication failed'
                });
            }

            try {
                // Create tokens and session
                const { accessToken, refreshToken } = await tokenService.createSession(
                    user._id,
                    req.get('User-Agent') || 'Unknown',
                    req.ip,
                    {}
                );

                // Set refresh token as HTTP-only cookie
                res.cookie('refreshToken', refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
                });

                // Return JSON response
                return res.status(200).json({
                    ok: true,
                    user: {
                        _id: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        role: user.role,
                        requiresProfileCompletion: user.requiresProfileCompletion || false,
                        isEmailVerified: user.isEmailVerified
                    },
                    accessToken,
                    isNewUser: !user.lastLoginAt
                });
            } catch (error) {
                console.error('Session creation error:', error);
                return res.status(500).json({
                    ok: false,
                    error: 'session_creation_failed',
                    message: 'Failed to create user session'
                });
            }
        })(req, res, next);
    }
);/**
 * Protected User Routes - Authentication Required
 */

// Session Management
router.get('/refresh', checkTokenBlacklist, authCtrl.refresh);
router.post('/logout', requireAuth, checkTokenBlacklist, deviceFingerprint, authCtrl.logout);
router.get('/sessions', requireAuth, checkTokenBlacklist, authCtrl.getSessions);
router.delete('/sessions/:sessionId', requireAuth, checkTokenBlacklist, enforce2FA, authCtrl.revokeSession);

// Profile Management
router.get('/me', requireAuth, checkTokenBlacklist, deviceFingerprint, authCtrl.getCurrentUser);
router.put('/profile', requireAuth, checkTokenBlacklist, deviceFingerprint, uploadProfileImage, authCtrl.updateProfile);
router.delete('/account', requireAuth, checkTokenBlacklist, enforce2FA, authCtrl.deleteAccount);

// Email Management
router.post('/verify/resend/:type', requireAuth, checkTokenBlacklist, authCtrl.resendVerification);
router.post('/email/change', requireAuth, checkTokenBlacklist, enforce2FA, authCtrl.changeEmail);
router.post('/email/confirm', requireAuth, checkTokenBlacklist, authCtrl.confirmChangeEmail);

// Password Management
router.post('/password/change', requireAuth, checkTokenBlacklist, enforce2FA, authCtrl.changePassword);

// 2FA Management
router.post('/2fa/setup', requireAuth, checkTokenBlacklist, deviceFingerprint, authCtrl.setup2FA);
router.post('/2fa/verify', requireAuth, checkTokenBlacklist, authCtrl.verify2FASetup);
router.post('/2fa/disable', requireAuth, checkTokenBlacklist, enforce2FA, authCtrl.disable2FA);

// Consent Management
router.get('/consents', requireAuth, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.getConsents);
router.post('/consent/accept', requireAuth, checkTokenBlacklist, authCtrl.acceptConsent);
router.post('/consent/revoke', requireAuth, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.revokeConsent);

/**
 * Admin Routes - Requires Admin Role + Consent
 */

// User Management
router.post('/verify/:userId',
    requireAuth,
    requireRole(['super_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.verify
);

router.get('/users',
    requireAuth,
    requireRole(['super_admin', 'company_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.getUsers
);

router.post('/users',
    requireAuth,
    requireRole(['super_admin', 'company_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.createUser
);

router.put('/users/:id',
    requireAuth,
    requireRole(['super_admin', 'company_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.updateUser
);

router.delete('/users/:id',
    requireAuth,
    requireRole(['super_admin', 'company_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.deleteUser
);

router.get('/users/:id',
    requireAuth,
    requireRole(['super_admin', 'company_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.getUserById
);

// Bulk Operations (Super Admin Only)
router.post('/users/bulk',
    requireAuth,
    requireRole(['super_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.bulkUpdateUsers
);

router.post('/users/:id/unlock',
    requireAuth,
    requireRole(['super_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.unlockAccount
);

// Compliance Management
router.get('/consents/compliance',
    requireAuth,
    requireRole(['super_admin']),
    checkTokenBlacklist,
    checkConsent(['terms_and_privacy']),
    authCtrl.checkConsentCompliance
);

module.exports = router;