"use strict";
// Lightweight cache helper that wraps the shared Redis client and provides
// JSON get/set/del with safe error handling.

const redis = require('/app/shared/redis');

const DEFAULT_TTL = 300; // seconds

async function getJSON(key) {
  try {
    const v = await redis.get(key);
    if (!v) return null;
    return JSON.parse(v);
  } catch (err) {
    // swallow cache errors and return null so callers fall back to DB
    console.warn('Cache.getJSON error', err.message);
    return null;
  }
}

async function setJSON(key, value, ttl = DEFAULT_TTL) {
  try {
    const s = JSON.stringify(value);
    if (ttl) return await redis.set(key, s, 'EX', ttl);
    return await redis.set(key, s);
  } catch (err) {
    console.warn('Cache.setJSON error', err.message);
    return null;
  }
}

async function del(key) {
  try {
    return await redis.del(key);
  } catch (err) {
    console.warn('Cache.del error', err.message);
    return null;
  }
}

module.exports = { getJSON, setJSON, del, DEFAULT_TTL };
