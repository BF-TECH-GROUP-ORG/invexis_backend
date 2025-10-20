const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User.models');
const Session = require('../src/models/Session.models');
const Consent = require('../src/models/Consent.models');
const Verification = require('../src/models/Verification.models');
const LoginHistory = require('../src/models/LoginHistory.models');
const Preference = require('../src/models/Preference.models');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock external services (tokenService, events)
jest.mock('../src/services/tokenService', () => ({
    signAccess: jest.fn().mockReturnValue('mockAccessToken'),
    signRefresh: jest.fn().mockReturnValue('mockRefreshToken'),
    verifyAccess: jest.fn().mockReturnValue({ sub: 'mockUserId' }),
    verifyRefresh: jest.fn().mockReturnValue({ sid: 'mockSid', uid: 'mockUid' }),
    createSession: jest.fn().mockResolvedValue({ refreshToken: 'mockRefresh', session: { _id: 'mockSessionId' } }),
    refreshTokens: jest.fn().mockResolvedValue({ accessToken: 'newAccess', refreshToken: 'newRefresh', sessionId: 'mockSid', userId: 'mockUid' }),
    revokeSessionByRefresh: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/services/authService', () => ({
    publishEvent: jest.fn().mockResolvedValue(true),
    setupSubscribers: jest.fn().mockResolvedValue(undefined)
}));

// Global mocks
const mockPublishEvent = require('../src/services/authService').publishEvent;
const mockCreateSession = require('../src/services/tokenService').createSession;

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    await require('../src/services/authService').setupSubscribers(); // Init subscribers if needed
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
    await Consent.deleteMany({});
    await Verification.deleteMany({});
    await LoginHistory.deleteMany({});
    await Preference.deleteMany({});
    jest.clearAllMocks();
});

afterEach(async () => {
    await User.deleteMany({});
    await Session.deleteMany({});
    await Consent.deleteMany({});
    await Verification.deleteMany({});
    await LoginHistory.deleteMany({});
    await Preference.deleteMany({});
});

// Test fixtures (role-specific, valid data)
const superAdminData = {
    firstName: 'Super',
    lastName: 'Admin',
    username: 'superadmin',
    email: 'super@invexis.com',
    phone: '+263123456789', // Valid E.164
    password: 'SuperPass123!',
    role: 'super_admin',
    dateOfBirth: new Date('1980-01-01'),
    gender: 'male',
    consent: {
        termsAccepted: true,
        termsVersion: '1.0',
        privacyAccepted: true,
        privacyVersion: '1.0',
        ip: '127.0.0.1',
        device: 'test-device'
    }
};

const companyAdminData = {
    ...superAdminData,
    username: 'companyadmin',
    email: 'company@invexis.com',
    phone: '+263987654321',
    password: 'CompanyPass123!',
    role: 'company_admin',
    nationalId: 'CA123456789',
    dateOfBirth: new Date('1985-05-15'),
    companies: ['company-uuid-1'],
    department: 'management',
    position: 'Admin'
};

const shopManagerData = {
    ...companyAdminData,
    username: 'shopmanager',
    email: 'shop@invexis.com',
    phone: '+263112233445',
    password: 'ShopPass123!',
    role: 'shop_manager',
    nationalId: 'SM987654321',
    dateOfBirth: new Date('1990-03-20'),
    shops: ['shop-uuid-1'],
    department: 'sales_manager',
    position: 'Manager'
};

const workerData = {
    ...shopManagerData,
    username: 'worker',
    email: 'worker@invexis.com',
    phone: '+263556677889',
    password: 'WorkerPass123!',
    role: 'worker',
    nationalId: 'W1122334455',
    dateOfBirth: new Date('1995-07-10'),
    department: 'sales',
    position: 'Associate'
};

const customerData = {
    firstName: 'Customer',
    lastName: 'Buyer',
    username: 'customer',
    email: 'customer@invexis.com',
    phone: '+263998877665',
    password: 'CustomerPass123!',
    role: 'customer',
    dateOfBirth: new Date('2000-12-25'), // Req for analytics
    gender: 'other',
    consent: {
        termsAccepted: true,
        termsVersion: '1.0',
        privacyAccepted: true,
        privacyVersion: '1.0',
        ip: '127.0.0.1',
        device: 'test-device'
    }
};

// OTP/Verification fixtures
const otpCode = '123456';
const verificationData = { type: 'email', code: otpCode };

// Consent fixture
const consentData = {
    userId: 'mockUserId',
    termsVersion: '1.0',
    privacyVersion: '1.0',
    termsAccepted: true,
    privacyAccepted: true,
    ip: '127.0.0.1',
    device: 'test'
};

describe('Auth Service Tests', () => {
    // Registration Tests (role-specific)
    describe('User Registration', () => {
        it('should register super_admin successfully (minimal fields)', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(superAdminData);
            expect(res.status).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.user.role).toBe('super_admin');
            expect(res.body.user.companies).toEqual([]);
            expect(res.body.user.shops).toEqual([]);
            expect(res.body.verificationTokens).toBeDefined();
            const user = await User.findOne({ email: superAdminData.email });
            expect(user).toBeDefined();
            expect(mockPublishEvent).toHaveBeenCalledWith('user.registered', expect.objectContaining({ role: 'super_admin' }));
        });

        it('should register company_admin successfully (no companies/shops req)', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(companyAdminData);
            expect(res.status).toBe(201);
            expect(res.body.user.role).toBe('company_admin');
            expect(res.body.user.companies).toEqual(['company-uuid-1']);
            expect(res.body.user.shops).toEqual([]);
            const user = await User.findOne({ email: companyAdminData.email });
            expect(user.nationalId).toBe(companyAdminData.nationalId);
            expect(mockPublishEvent).toHaveBeenCalledWith('internal.user.registered', expect.objectContaining({ role: 'company_admin' }));
        });

        it('should register shop_manager successfully (companies/shops req)', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(shopManagerData);
            expect(res.status).toBe(201);
            expect(res.body.user.role).toBe('shop_manager');
            expect(res.body.user.companies).toEqual(['company-uuid-1']);
            expect(res.body.user.shops).toEqual(['shop-uuid-1']);
            const user = await User.findOne({ email: shopManagerData.email });
            expect(user.department).toBe('sales_manager');
            expect(mockPublishEvent).toHaveBeenCalledWith('internal.user.registered', expect.objectContaining({ role: 'shop_manager' }));
        });

        it('should register worker successfully (full fields)', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(workerData);
            expect(res.status).toBe(201);
            expect(res.body.user.role).toBe('worker');
            expect(res.body.user.companies).toEqual(['company-uuid-1']);
            expect(res.body.user.shops).toEqual(['shop-uuid-1']);
            const user = await User.findOne({ email: workerData.email });
            expect(user.department).toBe('sales');
            expect(mockPublishEvent).toHaveBeenCalledWith('internal.user.registered', expect.objectContaining({ role: 'worker' }));
        });

        it('should register customer successfully (minimal, DOB req)', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(customerData);
            expect(res.status).toBe(201);
            expect(res.body.user.role).toBe('customer');
            expect(res.body.user.companies).toEqual([]);
            expect(res.body.user.shops).toEqual([]);
            expect(res.body.user.nationalId).toBeNull();
            const user = await User.findOne({ email: customerData.email });
            expect(user.dateOfBirth).toBeDefined();
            expect(mockPublishEvent).toHaveBeenCalledWith('customer.registered', expect.objectContaining({ phone: customerData.phone }));
        });

        it('should fail customer reg without DOB (analytics req)', async () => {
            const invalid = { ...customerData, dateOfBirth: undefined };
            const res = await request(app)
                .post('/auth/register')
                .send(invalid);
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('dateOfBirth');
        });

        it('should fail shop_manager reg without shops', async () => {
            const invalid = { ...shopManagerData, shops: [] };
            const res = await request(app)
                .post('/auth/register')
                .send(invalid);
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('shops');
        });

        it('should fail duplicate username', async () => {
            await request(app).post('/auth/register').send(customerData);
            const res = await request(app)
                .post('/auth/register')
                .send({ ...customerData, username: 'customer' });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('already exists');
        });

        it('should generate OTPs for email/phone and publish events', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({ ...customerData, email: 'test@email.com', phone: '+263123456789' });
            expect(res.status).toBe(201);
            expect(res.body.verificationTokens).toHaveLength(2); // Email + phone
            expect(mockPublishEvent).toHaveBeenCalledTimes(3); // registered, customer.registered, 2x verification.requested
        });
    });

    // Login Tests
    describe('User Login', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should login with email/password', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: customerData.email, password: customerData.password });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.accessToken).toBeDefined();
            expect(res.body.refreshToken).toBeDefined();
            expect(mockCreateSession).toHaveBeenCalled();
            expect(mockPublishEvent).toHaveBeenCalledWith('user.logged_in', expect.any(Object));
        });

        it('should login with phone/password', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: customerData.phone, password: customerData.password });
            expect(res.status).toBe(200);
            expect(res.body.user.email).toBe(customerData.email);
        });

        it('should fail with invalid credentials', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: customerData.email, password: 'wrong' });
            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Invalid credentials');
            // Check failed attempts increment
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.failedLoginAttempts).toBe(1);
        });

        it('should lock account after 5 failed attempts', async () => {
            for (let i = 0; i < 5; i++) {
                await request(app)
                    .post('/auth/login')
                    .send({ identifier: customerData.email, password: 'wrong' });
            }
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: customerData.email, password: 'wrong' });
            expect(res.status).toBe(423);
            expect(res.body.message).toBe('Account locked');
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.lockUntil).toBeDefined();
        });

        it('should require 2FA if enabled', async () => {
            user.twoFAEnabled = true;
            user.twoFASecret = speakeasy.generateSecretSync().base32;
            await user.save();
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: customerData.email, password: customerData.password });
            expect(res.status).toBe(401);
            expect(res.body.message).toBe('2FA required');
            // Valid OTP
            const validOtp = speakeasy.totp({ secret: user.twoFASecret, encoding: 'base32' });
            const resValid = await request(app)
                .post('/auth/login')
                .send({ identifier: customerData.email, password: customerData.password, otp: validOtp });
            expect(resValid.status).toBe(200);
        });

        it('should login via OTP', async () => {
            await request(app).post('/auth/login/otp').send({ identifier: customerData.email });
            const res = await request(app)
                .post('/auth/login/otp/verify')
                .send({ identifier: customerData.email, code: '123456' }); // Mock valid
            expect(res.status).toBe(200);
            expect(mockPublishEvent).toHaveBeenCalledWith('user.otp.login_completed', expect.any(Object));
        });
    });

    // Token Refresh/Logout Tests
    describe('Token Management', () => {
        let user, refreshToken;

        beforeEach(async () => {
            user = await User.create(customerData);
            refreshToken = 'mockRefresh';
        });

        it('should refresh token successfully', async () => {
            const res = await request(app)
                .post('/auth/refresh')
                .send({ refreshToken });
            expect(res.status).toBe(200);
            expect(res.body.accessToken).toBeDefined();
            expect(mockPublishEvent).toHaveBeenCalledWith('auth.session.refreshed', expect.any(Object));
        });

        it('should logout and revoke session', async () => {
            const res = await request(app)
                .post('/auth/logout')
                .send({ refreshToken });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(tokenService.revokeSessionByRefresh).toHaveBeenCalledWith(refreshToken);
            expect(mockPublishEvent).toHaveBeenCalledWith('user.logged_out', expect.any(Object));
        });
    });

    // Verification Tests
    describe('Verification Flows', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should verify email successfully', async () => {
            const res = await request(app)
                .post('/auth/verify')
                .send({ type: 'email', code: '123456' });
            expect(res.status).toBe(200);
            expect(res.body.verified).toBe(true);
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.isEmailVerified).toBe(true);
            expect(mockPublishEvent).toHaveBeenCalledWith('user.verification.email_completed', expect.any(Object));
        });

        it('should resend verification', async () => {
            const res = await request(app)
                .post('/auth/me/verify/resend/email')
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Resent');
            expect(mockPublishEvent).toHaveBeenCalledWith('verification.requested', expect.any(Object));
        });
    });

    // 2FA Tests
    describe('2FA Flows', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should setup 2FA', async () => {
            const res = await request(app)
                .post('/auth/me/2fa/setup')
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.secret).toBeDefined();
            expect(res.body.qr).toBeDefined();
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.twoFASecret).toBeDefined();
        });

        it('should verify 2FA setup', async () => {
            // Setup first
            await request(app).post('/auth/me/2fa/setup').set('Authorization', `Bearer mockAccessToken`);
            const res = await request(app)
                .post('/auth/me/2fa/verify')
                .send({ otp: '123456' })
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.enabled).toBe(true);
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.twoFAEnabled).toBe(true);
            expect(mockPublishEvent).toHaveBeenCalledWith('user.2fa.enabled', expect.any(Object));
        });

        it('should disable 2FA with valid OTP', async () => {
            // Enable first
            await request(app).post('/auth/me/2fa/setup').set('Authorization', `Bearer mockAccessToken`);
            await request(app).post('/auth/me/2fa/verify').send({ otp: '123456' }).set('Authorization', `Bearer mockAccessToken`);
            const res = await request(app)
                .post('/auth/me/2fa/disable')
                .send({ otp: '123456' })
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.disabled).toBe(true);
            const updatedUser = await User.findById(user._id);
            expect(updatedUser.twoFAEnabled).toBe(false);
            expect(updatedUser.twoFASecret).toBeUndefined();
            expect(mockPublishEvent).toHaveBeenCalledWith('user.2fa.disabled', expect.any(Object));
        });
    });

    // Profile Update Tests (with upload)
    describe('Profile Update', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should update profile (no upload)', async () => {
            const res = await request(app)
                .put('/auth/me')
                .send({ firstName: 'UpdatedCustomer' })
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.user.firstName).toBe('UpdatedCustomer');
            expect(mockPublishEvent).toHaveBeenCalledWith('user.profile.updated', expect.any(Object));
        });

        it('should update profile with picture upload', async () => {
            // Mock multer file (in real, middleware handles; here simulate)
            const res = await request(app)
                .put('/auth/me/profile-picture')
                .attach('profilePicture', 'test-image.jpg') // Assume middleware processes
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.user.profilePicture).toMatch(/\/uploads\/profiles\/.*/); // URL stored
        });
    });

    // Password Management Tests
    describe('Password Management', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should change password', async () => {
            const res = await request(app)
                .post('/auth/me/password/change')
                .send({ oldPassword: customerData.password, newPassword: 'NewPass123!', confirmPassword: 'NewPass123!' })
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Changed');
            expect(mockPublishEvent).toHaveBeenCalledWith('user.password.changed', expect.any(Object));
        });

        it('should request password reset', async () => {
            const res = await request(app)
                .post('/auth/password/reset')
                .send({ identifier: customerData.email });
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Code sent');
            expect(mockPublishEvent).toHaveBeenCalledWith('verification.requested', expect.any(Object));
        });

        it('should confirm password reset', async () => {
            await authService.requestPasswordReset(customerData.email); // Setup token
            const res = await request(app)
                .post('/auth/password/reset/confirm')
                .send({ identifier: customerData.email, code: '123456', newPassword: 'NewPass123!' });
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Reset');
            expect(mockPublishEvent).toHaveBeenCalledWith('user.password.reset_completed', expect.any(Object));
        });
    });

    // Session Management Tests
    describe('Session Management', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should get sessions', async () => {
            const res = await request(app)
                .get('/auth/sessions')
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.sessions).toBeDefined();
        });

        it('should revoke session', async () => {
            const sessionId = 'mockSessionId';
            const res = await request(app)
                .delete(`/auth/sessions/${sessionId}`)
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Revoked');
            expect(mockPublishEvent).toHaveBeenCalledWith('auth.session.revoked', expect.any(Object));
        });
    });

    // Consent Management Tests
    describe('Consent Management', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should accept consent', async () => {
            const res = await request(app)
                .post('/auth/consents/accept')
                .send(consentData)
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Consent accepted');
            const consent = await Consent.findOne({ userId: user._id });
            expect(consent).toBeDefined();
            expect(mockPublishEvent).toHaveBeenCalledWith('user.consent.accepted', expect.any(Object));
        });

        it('should get consents', async () => {
            await authService.acceptConsent(user._id, consentData);
            const res = await request(app)
                .get('/auth/consents')
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.consents).toHaveLength(1);
        });

        it('should revoke consent', async () => {
            await authService.acceptConsent(user._id, consentData);
            const res = await request(app)
                .post('/auth/me/consent/revoke')
                .send({ type: 'terms_and_privacy' })
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Revoked');
            const consent = await Consent.findOne({ userId: user._id });
            expect(consent.revoked).toBe(true);
            expect(mockPublishEvent).toHaveBeenCalledWith('user.consent.revoked', expect.any(Object));
        });

        it('should check consent compliance', async () => {
            await authService.acceptConsent(user._id, consentData);
            const res = await request(app)
                .get('/auth/consents/compliance?termsVersion=1.0&privacyVersion=1.0')
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.compliantCount).toBe(1);
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.consent.compliance_checked', expect.any(Object));
        });
    });

    // Admin Tests (super_admin only)
    describe('Admin Operations', () => {
        let adminUser;

        beforeEach(async () => {
            adminUser = await User.create(superAdminData);
        });

        it('should create user as admin', async () => {
            const res = await request(app)
                .post('/auth/users')
                .send(customerData)
                .set('Authorization', `Bearer mockAccessToken`); // Assume admin token
            expect(res.status).toBe(201);
            expect(res.body.user.role).toBe('customer');
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.user.created', expect.any(Object));
        });

        it('should update user as admin', async () => {
            const targetUser = await User.create(customerData);
            const res = await request(app)
                .put(`/auth/users/${targetUser._id}`)
                .send({ firstName: 'Updated' })
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.user.firstName).toBe('Updated');
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.user.updated', expect.any(Object));
        });

        it('should delete user as admin', async () => {
            const targetUser = await User.create(customerData);
            const res = await request(app)
                .delete(`/auth/users/${targetUser._id}`)
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Deleted');
            const deletedUser = await User.findById(targetUser._id);
            expect(deletedUser.isDeleted).toBe(true);
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.user.deleted', expect.any(Object));
        });

        it('should get user by ID as admin', async () => {
            const targetUser = await User.create(customerData);
            const res = await request(app)
                .get(`/auth/users/${targetUser._id}`)
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.user._id).toBe(targetUser._id.toString());
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.user.viewed', expect.any(Object));
        });

        it('should get users list as admin', async () => {
            await User.create([customerData, workerData]);
            const res = await request(app)
                .get('/auth/users?page=1&limit=10')
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.users).toHaveLength(2);
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.users.listed', expect.any(Object));
        });

        it('should bulk update users as admin', async () => {
            const users = await User.create([customerData, workerData]);
            const res = await request(app)
                .post('/auth/users/bulk')
                .send({ userIds: users.map(u => u._id.toString()), action: 'deactivate' })
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.updated).toBe(2);
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.users.bulk_updated', expect.any(Object));
        });

        it('should unlock account as admin', async () => {
            const lockedUser = await User.create(customerData);
            lockedUser.lockUntil = new Date(Date.now() + 60000);
            await lockedUser.save();
            const res = await request(app)
                .post(`/auth/users/${lockedUser._id}/unlock`)
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Unlocked');
            const unlockedUser = await User.findById(lockedUser._id);
            expect(unlockedUser.lockUntil).toBeNull();
            expect(mockPublishEvent).toHaveBeenCalledWith('admin.account.unlocked', expect.any(Object));
        });
    });

    // Account Deletion Tests
    describe('Account Deletion', () => {
        let user;

        beforeEach(async () => {
            user = await User.create(customerData);
        });

        it('should delete account successfully', async () => {
            const res = await request(app)
                .delete('/auth/me')
                .set('Authorization', `Bearer mockAccessToken`);
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Deleted');
            const deletedUser = await User.findById(user._id);
            expect(deletedUser.accountStatus).toBe('deactivated');
            expect(deletedUser.isDeleted).toBe(true);
            expect(mockPublishEvent).toHaveBeenCalledWith('user.account.deleted', expect.any(Object));
        });
    });
});