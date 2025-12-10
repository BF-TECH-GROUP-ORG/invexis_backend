// authRoutes.js
const express = require('express');
const passport = require('passport');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const adminCtrl = require('../controllers/adminController');
const tokenService = require('../services/tokenService');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Health check
router.get('/', (req, res) => {
    res.json({ message: "auth service is routed to the gateway" });
});

// Registration and Basic Auth
router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

// OTP Authentication
router.post('/login/otp/request', authCtrl.requestOtpLogin);
router.post('/login/otp/verify', authCtrl.verifyOtpLogin);

// Password Reset
router.post('/password/reset', authCtrl.requestPasswordReset);
router.post('/password/reset/confirm', authCtrl.confirmPasswordReset);

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
                // Compute secure/samesite dynamically (support ngrok HTTPS in development)
                const forwardedProto = (req.headers && req.headers['x-forwarded-proto']) || '';
                const isSecure = req.secure || forwardedProto.toLowerCase() === 'https' || process.env.NODE_ENV === 'production' || process.env.FORCE_COOKIE_SECURE === 'true';
                res.cookie('refreshToken', refreshToken, {
                    httpOnly: true,
                    secure: !!isSecure,
                    sameSite: isSecure ? 'none' : 'lax',
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
router.post('/refresh', authCtrl.refresh);
router.post('/logout', requireAuth, authCtrl.logout);
router.post('/logout-all', requireAuth, authCtrl.logoutAll);
router.get('/sessions', requireAuth, authCtrl.getSessions);
router.delete('/sessions/:sessionId', requireAuth, authCtrl.revokeSession);

// Profile Management
router.get('/me', requireAuth, authCtrl.getCurrentUser);
router.put('/profile', requireAuth, authCtrl.updateProfile);
router.delete('/account', requireAuth, authCtrl.deleteAccount);

// Email Management
router.post('/verify/resend/:type', requireAuth, authCtrl.resendVerification);
router.post('/email/change', requireAuth, authCtrl.changeEmail);
router.post('/email/confirm', requireAuth, authCtrl.confirmChangeEmail);

// Password Management
router.post('/password/change', requireAuth, authCtrl.changePassword);

// 2FA Management
router.post('/2fa/setup', requireAuth, authCtrl.setup2FA);
router.post('/2fa/verify', requireAuth, authCtrl.verify2FASetup);
router.post('/2fa/disable', requireAuth, authCtrl.disable2FA);

// Consent Management
router.get('/consents', requireAuth, authCtrl.getConsents);
router.post('/consent/accept', requireAuth, authCtrl.acceptConsent);
router.post('/consent/revoke', requireAuth, authCtrl.revokeConsent);

/**
 * Admin Routes - Requires Admin Role + Consent
 */

// User Management
router.post('/verify/:userId', requireAuth, authCtrl.verify);

router.get('/users', requireAuth, authCtrl.getUsers);

// Get company admins (cached)
router.get('/users/company-admins/:companyId', requireAuth, requireRole('super_admin'), adminCtrl.getCompanyAdmins);

// Get company workers (Authenticated users)
router.get('/company/:companyId/workers', authCtrl.getCompanyWorkers);

// Delete worker from company
router.delete('/company/:companyId/workers/:workerId', requireAuth, authCtrl.deleteWorkerFromCompany);

// Get all company admins regardless of company (cached)
router.get('/users/company-admins', adminCtrl.getAllCompanyAdmins);

router.post('/users', requireAuth, authCtrl.createUser);

router.put('/users/:id', requireAuth, authCtrl.updateUser);

router.delete('/users/:id', requireAuth, authCtrl.deleteUser);

router.get('/users/:id', requireAuth, authCtrl.getUserById);

// Bulk Operations (Super Admin Only)
router.post('/users/bulk', requireAuth, authCtrl.bulkUpdateUsers);

router.post('/users/:id/unlock', requireAuth, authCtrl.unlockAccount);

// Compliance Management
router.get('/consents/compliance', requireAuth, authCtrl.checkConsentCompliance);

module.exports = router;