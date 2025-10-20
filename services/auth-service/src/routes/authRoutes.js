// authRoutes.js
const express = require('express');
const passport = require('passport');
const csurf = require('csurf');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { uploadProfileImage } = require('../middleware/upload');
const {
    requireAuth,
    requireRole,
    authErrorHandler
} = require('../middleware/authMiddleware'); // Internal middleware
const {
    corsForAuth,
    rateLimitByUser,
    checkTokenBlacklist,
    checkConsent,
    deviceFingerprint,
    enforce2FA,
    errorHandler
} = require('/app/shared/middlewares/auth/auth'); // Shared middleware mounted via Docker

const csrfProtection = csurf({ cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' } });

// Apply CORS to all auth routes
router.use(corsForAuth);

// Rate limiting for public routes (100 req/hour per user/IP)
const loginRateLimit = rateLimitByUser(100, 3600000); // 1 hour window

// Health check route
router.get('/', (req, res) => {
    res.json({ message: "auth service is routed to the gateway" });
});

// In authRoutes.js, add before /register route
router.get('/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Public routes (no auth)
router.post('/register', authCtrl.register);
router.post('/login', loginRateLimit, csrfProtection, authCtrl.login);
router.post('/login/otp', loginRateLimit, csrfProtection, authCtrl.requestOtpLogin);
router.post('/login/otp/verify', loginRateLimit, csrfProtection, authCtrl.verifyOtpLogin);
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login?error=google' }), authCtrl.googleCallback);
router.post('/password/reset', loginRateLimit, csrfProtection, authCtrl.requestPasswordReset);
router.post('/password/reset/confirm', loginRateLimit, csrfProtection, authCtrl.confirmPasswordReset);

// Protected user routes (require authentication + active account)
router.post('/refresh', csrfProtection, checkTokenBlacklist, authCtrl.refresh);
router.post('/logout', requireAuth, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.logout);
router.put('/profile', requireAuth, csrfProtection, checkTokenBlacklist, deviceFingerprint, uploadProfileImage, authCtrl.updateProfile);
router.delete('/account', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, authCtrl.deleteAccount);
router.post('/verify/resend/:type', requireAuth, csrfProtection, checkTokenBlacklist, authCtrl.resendVerification);
router.post('/email/change', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, authCtrl.changeEmail);
router.post('/email/confirm', requireAuth, csrfProtection, checkTokenBlacklist, authCtrl.confirmChangeEmail);
router.post('/password/change', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, authCtrl.changePassword);
router.post('/consent/revoke', requireAuth, csrfProtection, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.revokeConsent);
router.post('/2fa/setup', requireAuth, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.setup2FA);
router.post('/2fa/verify', requireAuth, csrfProtection, checkTokenBlacklist, authCtrl.verify2FASetup);
router.post('/2fa/disable', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, authCtrl.disable2FA);
router.get('/sessions', requireAuth, checkTokenBlacklist, authCtrl.getSessions);
router.delete('/sessions/:sessionId', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, authCtrl.revokeSession);
router.get('/consents', requireAuth, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.getConsents);
router.post('/consent/accept', requireAuth, csrfProtection, checkTokenBlacklist, authCtrl.acceptConsent);

// Admin routes (require super_admin or company_admin role + consent)
router.post('/verify/:userId', requireAuth, requireRole(['super_admin']), csrfProtection, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.verify);
router.get('/users', requireAuth, requireRole(['super_admin', 'company_admin']), checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.getUsers);
router.post('/users', requireAuth, requireRole(['super_admin', 'company_admin']), csrfProtection, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.createUser);
router.put('/users/:id', requireAuth, requireRole(['super_admin', 'company_admin']), csrfProtection, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.updateUser);
router.delete('/users/:id', requireAuth, requireRole(['super_admin', 'company_admin']), csrfProtection, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.deleteUser);
router.get('/users/:id', requireAuth, requireRole(['super_admin', 'company_admin']), checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.getUserById);
router.post('/users/bulk', requireAuth, requireRole(['super_admin']), csrfProtection, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.bulkUpdateUsers);
router.post('/users/:id/unlock', requireAuth, requireRole(['super_admin']), csrfProtection, checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.unlockAccount);
router.get('/consents/compliance', requireAuth, requireRole(['super_admin']), checkTokenBlacklist, checkConsent(['terms_and_privacy']), authCtrl.checkConsentCompliance);

// Test route
router.get('/frank', (req, res) => res.json({ message: 'Hello Frank!' }));

// Apply custom error handler
router.use(authErrorHandler);
// Apply global error handler from shared middleware
router.use(errorHandler);

module.exports = router;