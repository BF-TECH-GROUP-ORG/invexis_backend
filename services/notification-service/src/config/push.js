// src/config/push.js
const admin = require("firebase-admin");
const path = require("path");
const logger = require("../utils/logger");

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      // Use environment variables (preferred for production/CI)
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'), // Handle newlines in env var
        }),
      });
      logger.info("✅ Firebase Admin initialized via environment variables");
    } else {
      // Fallback to the service account JSON file
      const serviceAccountPath = path.join(
        __dirname,
        "../../invexis-94bf5-firebase-adminsdk-fbsvc-2e1e699c1a.json"
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
      });
      logger.info("✅ Firebase Admin initialized via service account JSON file");
    }
  } catch (error) {
    logger.error("❌ Failed to initialize Firebase Admin:", error);
    throw error;
  }
}

module.exports = admin.messaging();
