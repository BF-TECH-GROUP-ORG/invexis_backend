// Seed script example (run manually for dev)
// scripts/seedTemplates.js
const mongoose = require('mongoose');
const Template = require('../src/models/Template');
const connectDB = require('../src/config/database');

const seed = async () => {
    await connectDB();
    await Template.create({
        name: 'welcome',
        type: 'email',
        content: '<h1>Welcome {{userName}}!</h1><p>{{body}}</p>',
        subject: 'Welcome to Invexis'
    });
    console.log('Templates seeded');
    process.exit();
};

seed();