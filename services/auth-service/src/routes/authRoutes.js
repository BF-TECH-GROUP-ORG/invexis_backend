// authRoutes.js (updated with comprehensive middleware integration)
const express = require('express');
const passport = require('passport');
const csurf = require('csurf');
const { uploadProfileImage } = require('../middleware/upload');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const {
    requireAuth,
    requireRole,
    checkTokenBlacklist,
    checkConsent,
    auditLog,
    rateLimitByUser,
    deviceFingerprint,
    enforce2FA,
    corsForAuth,
    errorHandler
} = require('/app/shared/middlewares/auth/auth.js');

const csrfProtection = csurf({ cookie: true });

// Apply CORS to all auth routes
router.use(corsForAuth);

// Rate limiting for high-traffic public routes (e.g., 100 req/hour per user/IP)
const loginRateLimit = rateLimitByUser(100, 3600000); // 1 hour window

router.get('/', (req, res) => {
    res.json({ message: "auth service is roued to the gateway" })
})

// Public routes (no auth)
router.post('/register', loginRateLimit, authCtrl.register);
router.post('/login', loginRateLimit, authCtrl.login);
router.post('/login/otp', loginRateLimit, authCtrl.requestOtpLogin);
router.post('/login/otp/verify', csrfProtection, authCtrl.verifyOtpLogin);
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google'), authCtrl.googleCallback);
router.post('/password/reset', authCtrl.requestPasswordReset);
router.post('/password/reset/confirm', csrfProtection, authCtrl.confirmPasswordReset);

// Protected user routes (auth + active account)
router.post('/refresh', csrfProtection, checkTokenBlacklist, authCtrl.refresh); // Add blacklist check for refresh
router.post('/logout', requireAuth, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.logout);
// router.get('/me', requireAuth, checkTokenBlacklist, authCtrl.getMe); // Updated to use middleware
router.put('/me', requireAuth, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.updateProfile);
router.put('/me/profile-picture', requireAuth, csrfProtection, uploadProfileImage, checkTokenBlacklist, authCtrl.updateProfilePicture);
router.delete('/me', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('account_delete'), authCtrl.deleteAccount);
router.post('/me/verify/resend/:type', requireAuth, csrfProtection, checkTokenBlacklist, authCtrl.resendVerification);
router.post('/me/email/change', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('email_change'), authCtrl.changeEmail);
router.post('/me/email/change/confirm', requireAuth, csrfProtection, checkTokenBlacklist, authCtrl.confirmChangeEmail);
router.post('/me/password/change', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('password_change'), authCtrl.changePassword);
router.post('/me/consent/revoke', requireAuth, csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('consent_revoke'), authCtrl.revokeConsent);
router.post('/me/2fa/setup', requireAuth, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.setup2FA);
router.post('/me/2fa/verify', requireAuth, csrfProtection, checkTokenBlacklist, authCtrl.verify2FASetup);
router.post('/me/2fa/disable', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('2fa_disable'), authCtrl.disable2FA);
router.get('/sessions', requireAuth, checkTokenBlacklist, authCtrl.getSessions);
router.delete('/sessions/:sessionId', requireAuth, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('session_revoke'), authCtrl.revokeSession);
router.get('/consents', requireAuth, checkTokenBlacklist, checkConsent(), authCtrl.getConsents);

// Admin routes (super_admin only + audits)
router.post('/verify/:userId', csrfProtection, requireAuth, requireRole('super_admin'), checkTokenBlacklist, checkConsent(), auditLog('user_verify'), authCtrl.verify);
router.get('/users', requireAuth, requireRole('super_admin'), checkTokenBlacklist, checkConsent(), auditLog('users_list'), authCtrl.getUsers);
router.post('/users', requireAuth, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_create'), authCtrl.createUser);
router.put('/users/:id', requireAuth, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_update'), authCtrl.updateUser);
router.delete('/users/:id', requireAuth, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_delete'), authCtrl.deleteUser);
router.get('/users/:id', requireAuth, requireRole('super_admin'), checkTokenBlacklist, checkConsent(), auditLog('user_view'), authCtrl.getUserById);
router.post('/users/bulk', requireAuth, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('users_bulk_update'), authCtrl.bulkUpdateUsers);
router.post('/users/:id/unlock', requireAuth, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_unlock'), authCtrl.unlockAccount);
router.get('/consents/compliance', requireAuth, requireRole('super_admin'), checkTokenBlacklist, checkConsent(), auditLog('consent_compliance_check'), authCtrl.checkConsentCompliance);

// Consent management (super_admin + consent checks)
router.post('/consents/accept', requireAuth, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('consent_accept'), authCtrl.acceptConsent);

// Test route
router.get('/frank', (req, res) => res.json({ 'message': 'Hello Frank!' }));

// Apply global error handler to this router (or in main app.js)
router.use(errorHandler);

module.exports = router;