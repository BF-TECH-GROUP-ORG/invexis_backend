// src/services/preferenceService.js
const Preference = require("../models/Preference");
const redisClient = require("/app/shared/redis");
const logger = require("../utils/logger");

const getPreferences = async (userId, companyId) => {
  const cacheKey = `pref:${userId}:${companyId}`;
  let prefs = await redisClient.get(cacheKey);

  if (prefs) {
    return JSON.parse(prefs);
  }

  try {
    const preference = await Preference.findOne({ userId, companyId });
    prefs = preference
      ? preference.preferences
      : {
          email: true,
          sms: true,
          push: true,
          inApp: true,
        };

    await redisClient.set(cacheKey, JSON.stringify(prefs), "EX", 3600); // 1h cache
    return prefs;
  } catch (error) {
    logger.error("Preference fetch error:", error);
    return { email: true, sms: true, push: true, inApp: true };
  }
};

const updatePreferences = async (userId, companyId, prefs) => {
  const cacheKey = `pref:${userId}:${companyId}`;
  await redisClient.del(cacheKey);

  return Preference.findOneAndUpdate(
    { userId, companyId },
    { preferences: prefs },
    { upsert: true, new: true }
  );
};

module.exports = { getPreferences, updatePreferences };
