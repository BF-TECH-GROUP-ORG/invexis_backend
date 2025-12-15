// authRoutes.js (updated with production middleware)
const express = require('express');
const passport = require('passport');
const csurf = require('csurf');
const { uploadProfileImage } = require('../middleware/upload');
const router = express.Router();
const authCtrl = require('../controllers/authController');

// Use production middleware
const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

// Legacy middleware for specific functionality
const {
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
    res.json({ message: "auth service is routed to the gateways" })
})

// Public routes (no auth)
router.post('/register', loginRateLimit, authCtrl.register);
router.post('/login', authCtrl.login);
router.post('/login/otp', loginRateLimit, authCtrl.requestOtpLogin);
router.post('/login/otp/verify', csrfProtection, authCtrl.verifyOtpLogin);
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google'), authCtrl.googleCallback);
router.post('/password/reset', authCtrl.requestPasswordReset);
router.post('/password/reset/confirm', csrfProtection, authCtrl.confirmPasswordReset);

// Protected user routes (auth + active account)
router.post('/refresh', csrfProtection, checkTokenBlacklist, authCtrl.refresh); // Add blacklist check for refresh
router.post('/logout', authenticateToken, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.logout);
router.get('/me', authenticateToken, checkTokenBlacklist, authCtrl.getMe); // Production auth middleware
router.put('/me', authenticateToken, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.updateProfile);
router.put('/me/profile-picture', authenticateToken, csrfProtection, uploadProfileImage, checkTokenBlacklist, authCtrl.updateProfilePicture);
router.delete('/me', authenticateToken, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('account_delete'), authCtrl.deleteAccount);
router.post('/me/verify/resend/:type', authenticateToken, csrfProtection, checkTokenBlacklist, authCtrl.resendVerification);
router.post('/me/fcm-token', authenticateToken, csrfProtection, checkTokenBlacklist, authCtrl.updateFcmToken);
router.post('/me/email/change', authenticateToken, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('email_change'), authCtrl.changeEmail);
router.post('/me/email/change/confirm', authenticateToken, csrfProtection, checkTokenBlacklist, authCtrl.confirmChangeEmail);
router.post('/me/password/change', authenticateToken, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('password_change'), authCtrl.changePassword);
router.post('/me/consent/revoke', authenticateToken, csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('consent_revoke'), authCtrl.revokeConsent);
router.post('/me/2fa/setup', authenticateToken, csrfProtection, checkTokenBlacklist, deviceFingerprint, authCtrl.setup2FA);
router.post('/me/2fa/verify', authenticateToken, csrfProtection, checkTokenBlacklist, authCtrl.verify2FASetup);
router.post('/me/2fa/disable', authenticateToken, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('2fa_disable'), authCtrl.disable2FA);
router.get('/sessions', authenticateToken, checkTokenBlacklist, authCtrl.getSessions);
router.delete('/sessions/:sessionId', authenticateToken, csrfProtection, checkTokenBlacklist, enforce2FA, auditLog('session_revoke'), authCtrl.revokeSession);
router.get('/consents', authenticateToken, checkTokenBlacklist, checkConsent(), authCtrl.getConsents);

// Admin routes (super_admin only + audits)
router.post('/verify/:userId', csrfProtection, authenticateToken, requireRole('super_admin'), checkTokenBlacklist, checkConsent(), auditLog('user_verify'), authCtrl.verify);
router.get('/users', authCtrl.getUsers);
router.post('/users', authenticateToken, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_create'), authCtrl.createUser);
router.put('/users/:id', authenticateToken, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_update'), authCtrl.updateUser);
router.delete('/users/:id', authenticateToken, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_delete'), authCtrl.deleteUser);
router.get('/users/:id', authenticateToken, requireRole('super_admin'), checkTokenBlacklist, checkConsent(), auditLog('user_view'), authCtrl.getUserById);
router.post('/users/bulk', authenticateToken, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('users_bulk_update'), authCtrl.bulkUpdateUsers);
router.post('/users/:id/unlock', authenticateToken, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('user_unlock'), authCtrl.unlockAccount);
router.get('/consents/compliance', authenticateToken, requireRole('super_admin'), checkTokenBlacklist, checkConsent(), auditLog('consent_compliance_check'), authCtrl.checkConsentCompliance);

// Consent management (super_admin + consent checks)
router.post('/consents/accept', authenticateToken, requireRole('super_admin'), csrfProtection, checkTokenBlacklist, checkConsent(), auditLog('consent_accept'), authCtrl.acceptConsent);

// Test route
router.get('/frank', (req, res) => res.json({ 'message': 'Hello Frank!' }));

// Apply global error handler to this router (or in main app.js)
router.use(errorHandler);

module.exports = router;