// routes.js - Production-ready auth routes
const express = require('express');
const passport = require('passport');
const router = express.Router();

// Controllers
const authCtrl = require('../controllers/authController');
const adminCtrl = require('../controllers/adminController');
const tokenService = require('../services/tokenService');

// Production middleware
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

// Health check
router.get('/', (req, res) => {
    res.json({
        message: "Invexis Auth Service",
        service: "auth-service",
        version: "2.0.0",
        status: "active",
        endpoints: {
            public: ["/register", "/login", "/login/otp/*", "/password/reset/*", "/google/*"],
            protected: ["/me", "/logout", "/sessions", "/profile", "/password/change"],
            admin: ["/users", "/verify/:userId", "/consents/compliance"]
        }
    });
});

// ============================================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================================

// Registration and Basic Auth
router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

// OTP Authentication  
router.post('/login/otp/request', authCtrl.requestOtpLogin);
router.post('/login/otp/verify', authCtrl.verifyOtpLogin);

// Password Reset
router.post('/password/reset', authCtrl.requestPasswordReset);
router.post('/password/reset/confirm', authCtrl.confirmPasswordReset);

// ============================================================================
// GOOGLE OAUTH ROUTES
// ============================================================================
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
);

// ============================================================================
// PROTECTED ROUTES (Authentication required)
// These routes use production middleware for JWT verification
// ============================================================================

// Token Management
router.post('/refresh', authCtrl.refresh); // Uses refresh token, no auth needed

// Session Management (Production middleware)
router.post('/logout', authenticateToken, authCtrl.logout);
router.post('/logout-all', authenticateToken, authCtrl.logoutAll);
router.get('/sessions', authenticateToken, authCtrl.getSessions);
router.delete('/sessions/:sessionId', authenticateToken, authCtrl.revokeSession);

// User Profile (Production middleware)
router.get('/me', authenticateToken, authCtrl.getMe); // Updated to use getMe method
router.put('/profile', authenticateToken, authCtrl.updateProfile);
router.post('/devices', authenticateToken, authCtrl.updateFcmToken);
router.delete('/account', authenticateToken, authCtrl.deleteAccount);

// Email Management (Production middleware)
router.post('/verify/resend/:type', authenticateToken, authCtrl.resendVerification);
router.post('/email/change', authenticateToken, authCtrl.changeEmail);
router.post('/email/confirm', authenticateToken, authCtrl.confirmChangeEmail);

// Password Management (Production middleware)
router.post('/password/change', authenticateToken, authCtrl.changePassword);

// 2FA Management (Production middleware)
router.post('/2fa/setup', authenticateToken, authCtrl.setup2FA);
router.post('/2fa/verify', authenticateToken, authCtrl.verify2FASetup);
router.post('/2fa/disable', authenticateToken, authCtrl.disable2FA);

// Consent Management (Production middleware)
router.get('/consents', authenticateToken, authCtrl.getConsents);
router.post('/consent/accept', authenticateToken, authCtrl.acceptConsent);
router.post('/consent/revoke', authenticateToken, authCtrl.revokeConsent);

// ============================================================================
// ADMIN ROUTES (Authentication + Role verification required)
// These routes use production middleware with role checking
// ============================================================================

// User Management (Admin routes)
router.post('/verify/:userId', authenticateToken, requireRole('super_admin'), authCtrl.verify);
// Company Admin Management (must be registered before param routes to avoid param collisions)
router.get('/users/company-admins/:companyId', authenticateToken, requireRole('super_admin'), adminCtrl.getCompanyAdmins);
router.get('/users/company-admins', authenticateToken, requireRole('super_admin'), adminCtrl.getAllCompanyAdmins);
router.get('/users', authenticateToken, requireRole('super_admin', 'company_admin'), authCtrl.getUsers);
router.post('/users', authenticateToken, requireRole('super_admin', 'company_admin'), authCtrl.createUser);
router.put('/users/:id', authenticateToken, requireRole('super_admin', 'company_admin'), authCtrl.updateUser);
router.delete('/users/:id', authenticateToken, requireRole('super_admin', 'company_admin'), authCtrl.deleteUser);
router.get('/users/:id', authenticateToken, requireRole('super_admin', 'company_admin'), authCtrl.getUserById);
// Alias for singular /user/:id
router.get('/user/:id', authenticateToken, requireRole('super_admin', 'company_admin'), authCtrl.getUserById);

// Company Admin Management (Admin routes)
// (routes moved above to avoid matching by the generic '/users/:id' param route)

// Company Worker Management
router.get('/company/:companyId/workers', authenticateToken, requireRole('company_admin', 'super_admin', 'worker'), authCtrl.getCompanyWorkers);

router.delete('/company/:companyId/workers/:workerId', authenticateToken, requireRole('company_admin', 'super_admin'), authCtrl.deleteWorkerFromCompany);

// Bulk Operations (Super Admin Only)
router.post('/users/bulk', authenticateToken, requireRole('super_admin'), authCtrl.bulkUpdateUsers);
router.post('/users/:id/unlock', authenticateToken, requireRole('super_admin'), authCtrl.unlockAccount);

// Compliance Management (Admin routes)
router.get('/consents/compliance', authenticateToken, requireRole('company_admin', 'super_admin'), authCtrl.checkConsentCompliance);

module.exports = router;