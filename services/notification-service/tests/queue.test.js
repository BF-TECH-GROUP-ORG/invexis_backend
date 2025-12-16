// tests/queue.test.js
const Queue = require('bull');
const { deliverNotification } = require('../src/queue/workers');
const Notification = require('../src/models/Notification');

jest.mock('../src/channels/email');
jest.mock('../src/channels/sms');
jest.mock('../src/channels/push');
jest.mock('../src/channels/inApp');
jest.mock('../src/services/preferenceService');

describe('Notification Queue Worker', () => {
    let queue;

    beforeAll(async () => {
        queue = new Queue('test', { redis: { host: 'localhost', port: 6379 } });
    });

    afterAll(async () => {
        await queue.close();
    });

    it('should deliver notification successfully', async () => {
        const mockNotification = await Notification.create({
            title: 'Test',
            body: 'Test body',
            templateName: 'test',
            payload: { email: 'test@test.com', phone: '+1', fcmToken: 'token', userName: 'Test' },
            channels: { email: true, sms: true, push: true, inApp: true },
            userId: new mongoose.Types.ObjectId(),
            companyId: new mongoose.Types.ObjectId(),
            scope: 'personal'
        });

        const job = await queue.add('deliver', { notificationId: mockNotification._id });
        const result = await deliverNotification({ notificationId: mockNotification._id });

        expect(result).toHaveLength(4);
        expect(result.every(r => r.success)).toBe(true);
    });
});