// src/config/push.js
const admin = require("firebase-admin");
const path = require("path");
const logger = require("../utils/logger");

// Use the service account JSON file
const serviceAccountPath = path.join(
  __dirname,
  "../../invexis-94bf5-firebase-adminsdk-fbsvc-2e1e699c1a.json"
);

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
    logger.info("✅ Firebase Admin initialized successfully");
  } catch (error) {
    logger.error("❌ Failed to initialize Firebase Admin:", error);
    throw error;
  }
}

module.exports = admin.messaging();
