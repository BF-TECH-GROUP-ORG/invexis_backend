// tests/templateService.test.js
const Handlebars = require('handlebars');

// Mock the Template model
const mockTemplate = {
  find: jest.fn(),
  validateTemplatesExist: jest.fn()
};

jest.mock('../src/models/Template', () => mockTemplate);
jest.mock('../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
}));

const { compileTemplatesForChannels } = require('../src/services/templateService');

describe('Template Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('compileTemplatesForChannels', () => {
    it('should compile email templates correctly', async () => {
      const mockTemplates = [
        {
          name: 'welcome',
          type: 'email',
          subject: 'Welcome {{userName}}!',
          content: '<h1>Hello {{userName}}</h1><p>Welcome to {{companyName}}</p>',
          metadata: {
            emailConfig: {
              isHtml: true,
              priority: 'normal'
            }
          }
        }
      ];

      mockTemplate.find.mockResolvedValue(mockTemplates);

      const payload = {
        userName: 'John Doe',
        companyName: 'Acme Corp'
      };

      const channels = { email: true };
      const result = await compileTemplatesForChannels('welcome', payload, channels);

      expect(result.email).toBeDefined();
      expect(result.email.subject).toBe('Welcome John Doe!');
      expect(result.email.html).toBe('<h1>Hello John Doe</h1><p>Welcome to Acme Corp</p>');
      expect(result.email.text).toBe('Hello John DoeWelcome to Acme Corp');
      expect(result.email.priority).toBe('normal');
    });

    it('should compile SMS templates correctly', async () => {
      const mockTemplates = [
        {
          name: 'welcome',
          type: 'sms',
          content: 'Welcome {{userName}} to {{companyName}}!',
          metadata: {
            smsConfig: {
              maxLength: 160,
              allowUnicode: true
            }
          }
        }
      ];

      mockTemplate.find.mockResolvedValue(mockTemplates);

      const payload = {
        userName: 'John',
        companyName: 'Acme'
      };

      const channels = { sms: true };
      const result = await compileTemplatesForChannels('welcome', payload, channels);

      expect(result.sms).toBeDefined();
      expect(result.sms.message).toBe('Welcome John to Acme!');
      expect(result.sms.maxLength).toBe(160);
      expect(result.sms.allowUnicode).toBe(true);
    });

    it('should compile push templates correctly', async () => {
      const mockTemplates = [
        {
          name: 'welcome',
          type: 'push',
          content: JSON.stringify({
            title: 'Welcome {{userName}}!',
            body: 'Hello {{userName}}, welcome to {{companyName}}',
            data: {
              action: 'open_welcome',
              userId: '{{userId}}'
            }
          }),
          metadata: {
            pushConfig: {
              sound: 'notification',
              priority: 'high'
            }
          }
        }
      ];

      mockTemplate.find.mockResolvedValue(mockTemplates);

      const payload = {
        userName: 'John',
        companyName: 'Acme',
        userId: '123'
      };

      const channels = { push: true };
      const result = await compileTemplatesForChannels('welcome', payload, channels);

      expect(result.push).toBeDefined();
      expect(result.push.title).toBe('Welcome John!');
      expect(result.push.body).toBe('Hello John, welcome to Acme');
      expect(result.push.data.action).toBe('open_welcome');
      expect(result.push.data.userId).toBe('123');
      expect(result.push.sound).toBe('notification');
      expect(result.push.priority).toBe('high');
    });

    it('should handle missing templates with defaults', async () => {
      mockTemplate.find.mockResolvedValue([]);

      const payload = { userName: 'John' };
      const channels = { email: true, sms: true };
      
      const result = await compileTemplatesForChannels('nonexistent', payload, channels);

      expect(result.email).toBeDefined();
      expect(result.email.subject).toBe('Notification');
      expect(result.email.html).toBe('<p>You have a new notification.</p>');
      
      expect(result.sms).toBeDefined();
      expect(result.sms.message).toBe('You have a new notification.');
    });

    it('should truncate SMS messages that exceed max length', async () => {
      const mockTemplates = [
        {
          name: 'long_message',
          type: 'sms',
          content: 'This is a very long message that exceeds the maximum length limit and should be truncated automatically by the template system',
          metadata: {
            smsConfig: {
              maxLength: 50
            }
          }
        }
      ];

      mockTemplate.find.mockResolvedValue(mockTemplates);

      const channels = { sms: true };
      const result = await compileTemplatesForChannels('long_message', {}, channels);

      expect(result.sms.message).toHaveLength(50);
      expect(result.sms.message).toMatch(/\.\.\.$/);
    });
  });

  describe('Handlebars helpers', () => {
    it('should format currency correctly', () => {
      const template = Handlebars.compile('Total: {{formatCurrency amount}}');
      const result = template({ amount: 99.99 });
      expect(result).toBe('Total: $99.99');
    });

    it('should truncate strings correctly', () => {
      const template = Handlebars.compile('{{truncate text 10}}');
      const result = template({ text: 'This is a long text that should be truncated' });
      expect(result).toBe('This is a ...');
    });

    it('should format dates correctly', () => {
      const template = Handlebars.compile('Date: {{formatDate date "short"}}');
      const result = template({ date: new Date('2023-12-25') });
      expect(result).toMatch(/Date: \d{1,2}\/\d{1,2}\/\d{4}/);
    });
  });
});
