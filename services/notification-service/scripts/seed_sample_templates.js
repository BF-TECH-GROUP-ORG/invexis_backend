#!/usr/bin/env node

// scripts/seed_sample_templates.js
// Seed sample templates for testing the improved template system

const mongoose = require('mongoose');
require('dotenv').config();

const Template = require('../src/models/Template');
const logger = require('../src/utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/invexis';

const sampleTemplates = [
  // Welcome templates
  {
    name: 'welcome',
    type: 'email',
    subject: 'Welcome to {{companyName}}!',
    content: `
      <h1>Welcome to {{companyName}}, {{userName}}! 🎉</h1>
      <p>Thanks for joining us. We're excited to have you on board.</p>
      <p><a href="{{actionUrl}}" style="background: #0b84ff; color: white; padding: 12px 18px; text-decoration: none; border-radius: 6px;">Verify your email</a></p>
      <p>Need help? Contact us at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a></p>
      <p>— The {{companyName}} Team</p>
      <p style="font-size: 12px; color: #666;">© {{currentYear}} {{companyName}}. All rights reserved.</p>
    `,
    metadata: {
      emailConfig: {
        isHtml: true,
        priority: 'normal'
      }
    }
  },
  {
    name: 'welcome',
    type: 'sms',
    content: 'Welcome to {{companyName}}, {{userName}}! Verify your account: {{actionUrl}}',
    metadata: {
      smsConfig: {
        maxLength: 160,
        allowUnicode: true
      }
    }
  },
  {
    name: 'welcome',
    type: 'push',
    content: JSON.stringify({
      title: 'Welcome to {{companyName}}!',
      body: 'Hi {{userName}}, tap to complete your setup',
      data: {
        action: 'open_welcome',
        url: '{{actionUrl}}'
      }
    }),
    metadata: {
      pushConfig: {
        sound: 'default',
        priority: 'normal'
      }
    }
  },
  {
    name: 'welcome',
    type: 'inApp',
    subject: 'Welcome to {{companyName}}!',
    content: 'Hi {{userName}}, welcome to {{companyName}}! Click here to complete your setup.',
    metadata: {}
  },

  // Order notification templates
  {
    name: 'order_notification',
    type: 'email',
    subject: 'Order {{orderId}} confirmed',
    content: `
      <h2>Order confirmed — {{orderId}}</h2>
      <p>Thanks for your purchase, {{userName}}. Here's your order summary:</p>
      
      <div style="margin: 20px 0;">
        {{#each orderItems}}
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
          <span>{{this.name}} x{{this.quantity}}</span>
          <span>{{formatCurrency this.lineTotal}}</span>
        </div>
        {{/each}}
      </div>
      
      <p><strong>Total: {{formatCurrency orderTotal}}</strong></p>
      
      <p><a href="{{actionUrl}}" style="background: #10b981; color: white; padding: 10px 16px; text-decoration: none; border-radius: 8px;">View order details</a></p>
      
      <p style="color: #666; font-size: 13px;">Questions? Contact {{supportEmail}}</p>
    `,
    metadata: {
      emailConfig: {
        isHtml: true,
        priority: 'normal'
      }
    }
  },
  {
    name: 'order_notification',
    type: 'sms',
    content: 'Order {{orderId}} confirmed! Total: {{orderTotal}}. View details: {{truncate actionUrl 30}}',
    metadata: {
      smsConfig: {
        maxLength: 160,
        allowUnicode: true
      }
    }
  },
  {
    name: 'order_notification',
    type: 'push',
    content: JSON.stringify({
      title: 'Order {{orderId}} confirmed',
      body: 'Your order total is {{orderTotal}}',
      data: {
        action: 'open_order',
        orderId: '{{orderId}}',
        url: '{{actionUrl}}'
      }
    }),
    metadata: {
      pushConfig: {
        sound: 'default',
        priority: 'high'
      }
    }
  },

  // Sale notification templates
  {
    name: 'sale_created',
    type: 'email',
    subject: 'Sale #{{saleId}} Confirmed',
    content: `
      <h2>Sale Confirmed — #{{saleId}}</h2>
      <p>Hello,</p>
      <p>A new sale has been successfully created.</p>
      
      <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px;">
        <p><strong>Sale ID:</strong> #{{saleId}}</p>
        <p><strong>Amount:</strong> {{formatCurrency amount}}</p>
        <p><strong>Date:</strong> {{formatDate createdAt}}</p>
      </div>
      
      <p>Thank you for your business!</p>
      <p>— The {{companyName}} Team</p>
    `,
    metadata: {
      emailConfig: {
        isHtml: true,
        priority: 'normal'
      }
    }
  },
  {
    name: 'sale_created',
    type: 'sms',
    content: 'Sale #{{saleId}} confirmed! Amount: {{amount}}. Thanks for your business!',
    metadata: {
      smsConfig: {
        maxLength: 160,
        allowUnicode: true
      }
    }
  },
  {
    name: 'sale_created',
    type: 'push',
    content: JSON.stringify({
      title: 'Sale #{{saleId}} Confirmed',
      body: 'New sale created for {{amount}}',
      data: {
        action: 'open_sale',
        saleId: '{{saleId}}'
      }
    }),
    metadata: {
      pushConfig: {
        sound: 'default',
        priority: 'normal'
      }
    }
  },
  {
    name: 'sale_created',
    type: 'inApp',
    subject: 'Sale #{{saleId}} Created',
    content: 'New sale #{{saleId}} created for {{amount}}',
    metadata: {}
  }
];

async function seedTemplates() {
  try {
    await mongoose.connect(MONGO_URI);
    logger.info('Connected to MongoDB');

    console.log('🌱 Seeding sample templates...');

    for (const templateData of sampleTemplates) {
      try {
        await Template.findOneAndUpdate(
          { name: templateData.name, type: templateData.type },
          templateData,
          { upsert: true, new: true }
        );
        console.log(`✅ Upserted template: ${templateData.name} (${templateData.type})`);
      } catch (error) {
        console.error(`❌ Failed to upsert template ${templateData.name} (${templateData.type}):`, error.message);
      }
    }

    console.log('🎉 Template seeding completed!');

  } catch (error) {
    console.error('❌ Template seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedTemplates();
