#!/usr/bin/env node

// scripts/test_templates.js
// Test script to validate template compilation and rendering

const mongoose = require('mongoose');
require('dotenv').config();

const Template = require('../src/models/Template');
const { compileTemplatesForChannels } = require('../src/services/templateService');
const logger = require('../src/utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/invexis';

async function testTemplateCompilation() {
  try {
    // Connect to database
    await mongoose.connect(MONGO_URI);
    logger.info('Connected to MongoDB');

    // Test data
    const testPayload = {
      userName: 'John Doe',
      companyName: 'Acme Corp',
      actionUrl: 'https://app.invexis.com/verify?token=abc123',
      supportEmail: 'support@invexis.com',
      orderId: 'ORD-12345',
      orderTotal: '$99.99',
      orderItems: [
        { name: 'Product A', quantity: 2, lineTotal: '$59.98' },
        { name: 'Product B', quantity: 1, lineTotal: '$39.99' }
      ],
      year: new Date().getFullYear()
    };

    const channels = {
      email: true,
      sms: true,
      push: true,
      inApp: true
    };

    // Test welcome template
    console.log('\n=== Testing Welcome Template ===');
    const welcomeContent = await compileTemplatesForChannels('welcome', testPayload, channels);
    
    console.log('\nEmail Content:');
    console.log('Subject:', welcomeContent.email?.subject);
    console.log('HTML Preview:', welcomeContent.email?.html?.substring(0, 200) + '...');
    
    console.log('\nSMS Content:');
    console.log('Message:', welcomeContent.sms?.message);
    
    console.log('\nPush Content:');
    console.log('Title:', welcomeContent.push?.title);
    console.log('Body:', welcomeContent.push?.body);
    console.log('Data:', welcomeContent.push?.data);
    
    console.log('\nIn-App Content:');
    console.log('Title:', welcomeContent.inApp?.title);
    console.log('Body:', welcomeContent.inApp?.body);

    // Test order notification template
    console.log('\n=== Testing Order Notification Template ===');
    const orderContent = await compileTemplatesForChannels('order_notification', testPayload, channels);
    
    console.log('\nEmail Content:');
    console.log('Subject:', orderContent.email?.subject);
    console.log('HTML Preview:', orderContent.email?.html?.substring(0, 200) + '...');

    // Test template validation
    console.log('\n=== Testing Template Validation ===');
    const validation = await Template.validateTemplatesExist('welcome', channels);
    console.log('Validation Result:', validation);

    // Test missing template
    console.log('\n=== Testing Missing Template ===');
    const missingContent = await compileTemplatesForChannels('nonexistent', testPayload, channels);
    console.log('Missing template content keys:', Object.keys(missingContent));

    console.log('\n✅ Template testing completed successfully');

  } catch (error) {
    console.error('❌ Template testing failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the test
testTemplateCompilation();
