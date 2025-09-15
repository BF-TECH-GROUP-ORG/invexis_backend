const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const User = require('../src/models/User.models');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock external services
jest.mock('../src/services/tokenService', () => ({
    generateTokens: jest.fn().mockReturnValue({ accessToken: 'mockAccessToken', refreshToken: 'mockRefreshToken' })
}));

jest.mock('../src/events/producer', () => ({
    publishEvent: jest.fn()
}));

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await User.deleteMany({});
});

afterEach(async () => {
    await User.deleteMany({});
});

// Test fixtures with corrected phone numbers (10-15 digits only)
const superAdminData = {
    firstName: 'Super',
    lastName: 'Admin',
    username: 'superadminuser',
    email: 'superadmin@example.com',
    phone: '1234567890', // 10 digits
    profilePicture: 'https://example.com/profile/superadmin.jpg',
    password: 'SuperPass123',
    role: 'super_admin',
    nationalId: 'SUPER123456789',
    dateOfBirth: '1980-01-01T00:00:00Z',
    gender: 'male',
    companyId: null,
    shopId: null,
    position: 'System Overseer',
    department: 'Administration',
    dateJoined: '2025-09-08T13:19:00Z', // Updated to current time
    employmentStatus: 'active',
    emergencyContact: { name: 'Emergency Contact', phone: '9876543210' },
    address: { street: '123 Main St', city: 'Harare', state: 'Harare Province', postalCode: '00263', country: 'Zimbabwe' },
    preferences: { theme: 'dark', language: 'en', notifications: { email: true, smsEnabled: true, inApp: true } },
    consent: { termsAccepted: true, termsVersion: '1.0', termsAcceptedAt: '2025-09-08T13:19:00Z', privacyAccepted: true, privacyVersion: '1.0', privacyAcceptedAt: '2025-09-08T13:19:00Z', fingerprintConsent: true, nationalIdConsent: true, ip: '192.168.1.1', device: 'Desktop' },
    fingerprints: [{ deviceId: 'device001', template: Buffer.from('binary_fingerprint_data_base64_encoded') }]
};

const companyAdminData = {
    firstName: 'Company',
    lastName: 'Admin',
    username: 'companyadminuser',
    email: 'companyadmin@example.com',
    phone: '1234567891', // 10 digits
    profilePicture: 'https://example.com/profile/companyadmin.jpg',
    password: 'CompanyPass123',
    role: 'company_admin',
    nationalId: 'COMPANY987654321',
    dateOfBirth: '1985-05-15T00:00:00Z',
    gender: 'female',
    companyId: null,
    shopId: null,
    position: 'Company Lead',
    department: 'Management',
    dateJoined: '2025-09-08T13:19:00Z', // Updated to current time
    employmentStatus: 'active',
    emergencyContact: { name: 'Emergency Contact', phone: '8765432109' },
    address: { street: '456 Elm St', city: 'Bulawayo', state: 'Bulawayo Province', postalCode: '00263', country: 'Zimbabwe' },
    preferences: { theme: 'light', language: 'en', notifications: { email: true, smsEnabled: true, inApp: false } },
    consent: { termsAccepted: true, termsVersion: '1.0', termsAcceptedAt: '2025-09-08T13:19:00Z', privacyAccepted: true, privacyVersion: '1.0', privacyAcceptedAt: '2025-09-08T13:19:00Z', fingerprintConsent: true, nationalIdConsent: true, ip: '192.168.1.2', device: 'Laptop' },
    fingerprints: [{ deviceId: 'device002', template: Buffer.from('binary_fingerprint_data_base64_encoded') }]
};

const shopManagerData = {
    firstName: 'Shop',
    lastName: 'Manager',
    username: 'shopmanageruser',
    email: 'shopmanager@example.com',
    phone: '1234567892', // 10 digits
    profilePicture: 'https://example.com/profile/shopmanager.jpg',
    password: 'ShopPass123',
    role: 'shop_manager',
    nationalId: 'SHOP1122334455',
    dateOfBirth: '1990-03-20T00:00:00Z',
    gender: 'male',
    companyId: 'company123',
    shopId: 'shop456',
    position: 'Store Manager',
    department: 'Sales',
    dateJoined: '2025-09-08T13:19:00Z', // Updated to current time
    employmentStatus: 'active',
    emergencyContact: { name: 'Emergency Contact', phone: '7654321098' },
    address: { street: '789 Oak St', city: 'Mutare', state: 'Manicaland Province', postalCode: '00263', country: 'Zimbabwe' },
    preferences: { theme: 'system', language: 'en', notifications: { email: false, smsEnabled: true, inApp: true } },
    consent: { termsAccepted: true, termsVersion: '1.0', termsAcceptedAt: '2025-09-08T13:19:00Z', privacyAccepted: true, privacyVersion: '1.0', privacyAcceptedAt: '2025-09-08T13:19:00Z', fingerprintConsent: true, nationalIdConsent: true, ip: '192.168.1.3', device: 'Tablet' },
    fingerprints: [{ deviceId: 'device003', template: Buffer.from('binary_fingerprint_data_base64_encoded') }]
};

const workerData = {
    firstName: 'Worker',
    lastName: 'User',
    username: 'workeruser',
    email: 'worker@example.com',
    phone: '1234567893', // 10 digits
    profilePicture: 'https://example.com/profile/worker.jpg',
    password: 'WorkerPass123',
    role: 'worker',
    nationalId: 'WORKER9988776655',
    dateOfBirth: '1995-07-10T00:00:00Z',
    gender: 'female',
    companyId: 'company123',
    shopId: 'shop456',
    position: 'Sales Associate',
    department: 'Customer Service',
    dateJoined: '2025-09-08T13:19:00Z', // Updated to current time
    employmentStatus: 'active',
    emergencyContact: { name: 'Emergency Contact', phone: '6543210987' },
    address: { street: '101 Pine St', city: 'Gweru', state: 'Midlands Province', postalCode: '00263', country: 'Zimbabwe' },
    preferences: { theme: 'dark', language: 'en', notifications: { email: true, smsEnabled: false, inApp: true } },
    consent: { termsAccepted: true, termsVersion: '1.0', termsAcceptedAt: '2025-09-08T13:19:00Z', privacyAccepted: true, privacyVersion: '1.0', privacyAcceptedAt: '2025-09-08T13:19:00Z', fingerprintConsent: true, nationalIdConsent: true, ip: '192.168.1.4', device: 'Mobile' },
    fingerprints: [{ deviceId: 'device004', template: Buffer.from('binary_fingerprint_data_base64_encoded') }]
};

const customerData = {
    firstName: 'Customer',
    lastName: 'User',
    username: 'customeruser',
    email: 'customer@example.com',
    phone: '1234567894', // 10 digits
    profilePicture: 'https://example.com/profile/customer.jpg',
    password: 'CustomerPass123',
    role: 'customer',
    nationalId: 'CUST1234567890',
    dateOfBirth: '2000-12-25T00:00:00Z',
    gender: 'other',
    companyId: null,
    shopId: null,
    position: null,
    department: null,
    dateJoined: '2025-09-08T13:19:00Z', // Updated to current time
    employmentStatus: 'active',
    emergencyContact: { name: 'Emergency Contact', phone: '5432109876' },
    address: { street: '202 Maple St', city: 'Masvingo', state: 'Masvingo Province', postalCode: '00263', country: 'Zimbabwe' },
    preferences: { theme: 'system', language: 'en', notifications: { email: true, smsEnabled: true, inApp: true } },
    consent: { termsAccepted: true, termsVersion: '1.0', termsAcceptedAt: '2025-09-08T13:19:00Z', privacyAccepted: true, privacyVersion: '1.0', privacyAcceptedAt: '2025-09-08T13:19:00Z', fingerprintConsent: false, nationalIdConsent: true, ip: '192.168.1.5', device: 'Smartphone' }
};

describe('Auth Routes', () => {
    // Registration Tests
    describe('POST /auth/register', () => {
        it('should register a new super admin', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(superAdminData);
            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
            expect(res.body.user.role).toBe('super_admin');
            expect(res.body.user.companyId).toBeNull();
            expect(res.body.user.shopId).toBeNull();
        });

        it('should register a new company admin', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(companyAdminData);
            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
            expect(res.body.user.role).toBe('company_admin');
            expect(res.body.user.companyId).toBeNull();
            expect(res.body.user.shopId).toBeNull();
        });

        it('should register a new shop manager', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(shopManagerData);
            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
            expect(res.body.user.role).toBe('shop_manager');
            expect(res.body.user.companyId).toBe('company123');
            expect(res.body.user.shopId).toBe('shop456');
        });

        it('should register a new worker', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(workerData);
            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
            expect(res.body.user.role).toBe('worker');
            expect(res.body.user.companyId).toBe('company123');
            expect(res.body.user.shopId).toBe('shop456');
        });

        it('should register a new customer', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(customerData);
            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
            expect(res.body.user.role).toBe('customer');
            expect(res.body.user.companyId).toBeNull();
            expect(res.body.user.shopId).toBeNull();
        });

        it('should fail registration with missing required fields', async () => {
            const invalidData = { role: 'customer' }; // Missing firstName, lastName, password, consent
            const res = await request(app)
                .post('/auth/register')
                .send(invalidData);
            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('message');
        });

        it('should fail registration with duplicate email', async () => {
            await request(app).post('/auth/register').send(customerData);
            const res = await request(app)
                .post('/auth/register')
                .send({ ...customerData, email: 'customer@example.com' });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('User already exists');
        });

        it('should fail registration for customer with fingerprints', async () => {
            const invalidData = { ...customerData, fingerprints: [{ deviceId: 'device005', template: Buffer.from('data') }] };
            const res = await request(app)
                .post('/auth/register')
                .send(invalidData);
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain('Fingerprints only allowed for employees/admins');
        });

        it('should fail registration for shop manager without companyId', async () => {
            const invalidData = { ...shopManagerData, companyId: null };
            const res = await request(app)
                .post('/auth/register')
                .send(invalidData);
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain('companyId');
        });
    });

    // Login Tests
    describe('POST /auth/login', () => {
        let registeredUser;

        beforeEach(async () => {
            registeredUser = await User.create(customerData);
        });

        it('should login with valid credentials', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: 'customer@example.com', password: 'CustomerPass123' });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
        });

        it('should fail login with invalid password', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: 'customer@example.com', password: 'wrongpass' });
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Invalid password');
        });

        it('should fail login with missing identifier', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ password: 'CustomerPass123' });
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Identifier and password are required');
        });

        it('should login worker with companyAdminPhone', async () => {
            const worker = await User.create(workerData);
            const admin = await User.create(companyAdminData);
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: 'worker@example.com', password: 'WorkerPass123', companyAdminPhone: '1234567891' });
            expect(res.statusCode).toBe(200);
            expect(res.body.user._id).toBe(worker._id.toString());
        });

        it('should fail worker login without companyAdminPhone', async () => {
            await User.create(workerData);
            const res = await request(app)
                .post('/auth/login')
                .send({ identifier: 'worker@example.com', password: 'WorkerPass123' });
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Company admin phone number is required for workers');
        });
    });

    // Fingerprint Login Tests
    describe('POST /auth/login/fingerprint', () => {
        let registeredWorker;

        beforeEach(async () => {
            registeredWorker = await User.create(workerData);
        });

        it('should login with valid fingerprint', async () => {
            const res = await request(app)
                .post('/auth/login/fingerprint')
                .send({ fingerprint: { deviceId: 'device004', template: Buffer.from('binary_fingerprint_data_base64_encoded') } });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
            expect(res.body.user._id).toBe(registeredWorker._id.toString());
        });

        it('should fail login with invalid fingerprint', async () => {
            const res = await request(app)
                .post('/auth/login/fingerprint')
                .send({ fingerprint: { deviceId: 'device999', template: Buffer.from('wrong_data') } });
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Invalid fingerprint');
        });

        it('should fail login without fingerprint', async () => {
            const res = await request(app)
                .post('/auth/login/fingerprint')
                .send({});
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Fingerprint is required');
        });
    });
});