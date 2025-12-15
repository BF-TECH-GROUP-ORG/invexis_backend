#!/usr/bin/env node

// Test script to check Cloudinary configuration
require('dotenv').config();

console.log('🔍 Testing Cloudinary Configuration...\n');

// Check environment variables
const requiredEnvVars = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY', 
  'CLOUDINARY_API_SECRET'
];

let envConfigured = true;
requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`✅ ${varName}: Set`);
  } else {
    console.log(`❌ ${varName}: Missing`);
    envConfigured = false;
  }
});

if (!envConfigured) {
  console.log('\n📝 To enable Cloudinary, add these environment variables:');
  console.log('   CLOUDINARY_CLOUD_NAME=your_cloud_name');
  console.log('   CLOUDINARY_API_KEY=your_api_key');
  console.log('   CLOUDINARY_API_SECRET=your_api_secret\n');
  console.log('💡 Without these, the service will use placeholder images for uploads.');
  process.exit(0);
}

// Test Cloudinary connection
try {
  const cloudinary = require('cloudinary').v2;
  
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Test API connection
  cloudinary.api.ping()
    .then(result => {
      console.log('\n🎉 Cloudinary connection successful!');
      console.log(`   Status: ${result.status}`);
      console.log('   ✅ File uploads will work with real cloud storage\n');
    })
    .catch(error => {
      console.log('\n❌ Cloudinary connection failed:');
      console.log(`   Error: ${error.message}`);
      console.log('   ⚠️  Service will use placeholder images for uploads\n');
    });

} catch (error) {
  console.log(`\n❌ Cloudinary package error: ${error.message}`);
  console.log('   ⚠️  Service will use placeholder images for uploads\n');
}