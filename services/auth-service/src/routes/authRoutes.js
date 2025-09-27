// authRoutes.js (updated with functional /consents/accept route)
const express = require('express');
const passport = require('passport');
const csurf = require('csurf');
const { uploadProfileImage } = require('../middleware/upload');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const csrfProtection = csurf({ cookie: true });

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.post('/login/otp', authCtrl.requestOtpLogin);
router.post('/login/otp/verify', csrfProtection, authCtrl.verifyOtpLogin);
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google'), authCtrl.googleCallback);
router.post('/refresh', csrfProtection, authCtrl.refresh);
router.post('/logout', requireAuth, csrfProtection, authCtrl.logout);
router.post('/verify/:userId', csrfProtection, authCtrl.verify);
router.post('/password/reset', authCtrl.requestPasswordReset);
router.post('/password/reset/confirm', csrfProtection, authCtrl.confirmPasswordReset);
router.get('/me', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));
router.put('/me', requireAuth, csrfProtection, authCtrl.updateProfile);
router.put('/me/profile-picture', requireAuth, csrfProtection, uploadProfileImage, authCtrl.updateProfile);
router.delete('/me', requireAuth, csrfProtection, authCtrl.deleteAccount);
router.post('/me/verify/resend/:type', requireAuth, csrfProtection, authCtrl.resendVerification);
// router.post('/me/verify/resend/:type(email|phone)', requireAuth, csrfProtection, authCtrl.resendVerification);
router.post('/me/email/change', requireAuth, csrfProtection, authCtrl.changeEmail);
router.post('/me/email/change/confirm', requireAuth, csrfProtection, authCtrl.confirmChangeEmail);
router.post('/me/password/change', requireAuth, csrfProtection, authCtrl.changePassword);
router.post('/me/consent/revoke', requireAuth, csrfProtection, authCtrl.revokeConsent);
router.post('/me/2fa/setup', requireAuth, csrfProtection, authCtrl.setup2FA);
router.post('/me/2fa/verify', requireAuth, csrfProtection, authCtrl.verify2FASetup);
router.post('/me/2fa/disable', requireAuth, csrfProtection, authCtrl.disable2FA);
router.get('/sessions', requireAuth, authCtrl.getSessions);
router.delete('/sessions/:sessionId', requireAuth, csrfProtection, authCtrl.revokeSession);
router.get('/consents', requireAuth, authCtrl.getConsents);
router.get('/consents/compliance', requireAuth, requireRole('super_admin'), authCtrl.checkConsentCompliance);

router.get('/users', authCtrl.getUsers);
router.post('/users', requireAuth, requireRole('super_admin'), csrfProtection, authCtrl.createUser);
router.put('/users/:id', requireAuth, requireRole('super_admin'), csrfProtection, authCtrl.updateUser);
router.delete('/users/:id', requireAuth, requireRole('super_admin'), csrfProtection, authCtrl.deleteUser);
router.get('/users/:id', requireAuth, requireRole('super_admin'), csrfProtection, authCtrl.getUserById);
router.post('/users/bulk', requireAuth, requireRole('super_admin'), csrfProtection, authCtrl.bulkUpdateUsers);
router.post('/users/:id/unlock', requireAuth, requireRole('super_admin'), csrfProtection, authCtrl.unlockAccount);
router.post('/consents/accept', requireAuth, requireRole('super_admin'), csrfProtection, authCtrl.acceptConsent);
router.get('/frank', (req, res) => res.json({ 'message': 'Hello Frank!' }));

module.exports = router;