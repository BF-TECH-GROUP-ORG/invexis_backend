// test-setup.js - Quick verification of notification service setup
require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("./src/utils/logger");

async function testSetup() {
  console.log("\n🧪 Testing Notification Service Setup...\n");

  try {
    // Test 1: Check environment variables
    console.log("✓ Test 1: Environment Variables");
    const requiredEnvs = [
      "MONGO_URI",
      "EMAIL_HOST",
      "EMAIL_USER",
      "EMAIL_PASS",
      "TWILIO_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
    ];

    for (const env of requiredEnvs) {
      if (!process.env[env]) {
        console.log(`  ❌ Missing: ${env}`);
      } else {
        console.log(`  ✅ ${env} configured`);
      }
    }

    // Test 2: Check MongoDB connection
    console.log("\n✓ Test 2: MongoDB Connection");
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("  ✅ MongoDB connected");
      await mongoose.disconnect();
    } catch (error) {
      console.log(`  ❌ MongoDB error: ${error.message}`);
    }

    // Test 3: Check shared resources
    console.log("\n✓ Test 3: Shared Resources");
    try {
      const rabbitmq = require("/app/shared/rabbitmq");
      console.log("  ✅ RabbitMQ module loaded");
    } catch (error) {
      console.log(`  ❌ RabbitMQ error: ${error.message}`);
    }

    try {
      const redis = require("/app/shared/redis");
      console.log("  ✅ Redis module loaded");
    } catch (error) {
      console.log(`  ❌ Redis error: ${error.message}`);
    }

    // Test 4: Check models
    console.log("\n✓ Test 4: Models");
    try {
      const Notification = require("./src/models/Notification");
      console.log("  ✅ Notification model loaded");
    } catch (error) {
      console.log(`  ❌ Notification model error: ${error.message}`);
    }

    try {
      const DeliveryLog = require("./src/models/DeliveryLog");
      console.log("  ✅ DeliveryLog model loaded");
    } catch (error) {
      console.log(`  ❌ DeliveryLog model error: ${error.message}`);
    }

    // Test 5: Check channels
    console.log("\n✓ Test 5: Channels");
    try {
      const { sendEmail } = require("./src/channels/email");
      console.log("  ✅ Email channel loaded");
    } catch (error) {
      console.log(`  ❌ Email channel error: ${error.message}`);
    }

    try {
      const { sendSMS } = require("./src/channels/sms");
      console.log("  ✅ SMS channel loaded");
    } catch (error) {
      console.log(`  ❌ SMS channel error: ${error.message}`);
    }

    try {
      const { sendPush } = require("./src/channels/push");
      console.log("  ✅ Push channel loaded");
    } catch (error) {
      console.log(`  ❌ Push channel error: ${error.message}`);
    }

    try {
      const { sendInApp } = require("./src/channels/inapp");
      console.log("  ✅ In-App channel loaded");
    } catch (error) {
      console.log(`  ❌ In-App channel error: ${error.message}`);
    }

    // Test 6: Check utilities
    console.log("\n✓ Test 6: Utilities");
    try {
      const { checkRateLimit } = require("./src/utils/rateLimiter");
      console.log("  ✅ Rate limiter loaded");
    } catch (error) {
      console.log(`  ❌ Rate limiter error: ${error.message}`);
    }

    try {
      const { createEmailCircuitBreaker } = require("./src/utils/circuitBreaker");
      console.log("  ✅ Circuit breaker loaded");
    } catch (error) {
      console.log(`  ❌ Circuit breaker error: ${error.message}`);
    }

    console.log("\n✅ Setup verification complete!\n");
  } catch (error) {
    console.error("❌ Setup verification failed:", error);
    process.exit(1);
  }
}

testSetup();

