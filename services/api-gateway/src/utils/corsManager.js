const fs = require('fs');
const path = require('path');
const { getRedisClient } = require('./redis');

const REDIS_KEY = 'gateway:allowed_origins';
const FILE_PATH = path.join(__dirname, '..', 'config', 'allowed-origins.json');

let origins = null; // in-memory cache

const parseEnvOrigins = (raw) => {
  if (!raw) {
    // Fail-safe: In development, allow localhost. In production, return empty list.
    return process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:5173'];
  }
  if (raw.trim() === '*') {
    // Only allow '*' if specifically requested AND NOT in production (safety)
    if (process.env.NODE_ENV === 'production') {
      console.warn('corsManager: wildcard CORS detected in production. Restricting to empty list.');
      return [];
    }
    return ['*'];
  }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

function readFileOrigins() {
  try {
    if (!fs.existsSync(FILE_PATH)) return null;
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch (err) {
    console.warn('corsManager: failed to read file origins', err.message);
    return null;
  }
}

function writeFileOrigins(arr) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(arr, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('corsManager: failed to write file origins', err.message);
    return false;
  }
}

async function init(initialEnv) {
  // Start with env var
  origins = parseEnvOrigins(initialEnv);

  // Try to read file first (editable list in repo)
  const fileList = readFileOrigins();
  if (fileList && Array.isArray(fileList) && fileList.length) {
    origins = fileList;
  }

  const client = getRedisClient();
  if (!client) {
    // Persist current origins to file for visibility
    writeFileOrigins(origins);
    return origins;
  }

  try {
    const stored = await client.get(REDIS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        origins = parsed;
      }
    } else {
      // Persist initial origins to redis and file
      await client.set(REDIS_KEY, JSON.stringify(origins));
      writeFileOrigins(origins);
    }
  } catch (err) {
    console.warn('corsManager: Redis not available or error reading key, using file/env list');
    // ensure file saved
    writeFileOrigins(origins);
  }

  // Periodic refresh in case other instances update
  setInterval(async () => {
    try {
      const s = await client.get(REDIS_KEY);
      if (!s) return;
      const p = JSON.parse(s);
      if (JSON.stringify(p) !== JSON.stringify(origins)) {
        origins = p;
        console.log('corsManager: origins refreshed from redis');
        // keep file in sync
        writeFileOrigins(origins);
      }
    } catch (e) {
      // ignore
    }
  }, 60 * 1000);

  return origins;
}

function getOrigins() {
  if (origins === null) {
    // fallback to reading file or wildcard
    const fileList = readFileOrigins();
    if (fileList && Array.isArray(fileList) && fileList.length) return fileList;
    return ['*'];
  }
  return origins;
}

async function saveToRedisAndFile(arr) {
  const client = getRedisClient();
  let savedRedis = false;
  if (client) {
    try {
      await client.set(REDIS_KEY, JSON.stringify(arr));
      savedRedis = true;
    } catch (err) {
      console.warn('corsManager: failed to save to redis', err.message);
    }
  }
  const savedFile = writeFileOrigins(arr);
  return savedRedis || savedFile;
}

async function addOrigin(origin) {
  if (!origin) return false;
  if (origins === null) origins = getOrigins();
  if (origins.includes(origin)) return true;
  origins.push(origin);
  await saveToRedisAndFile(origins);
  return true;
}

async function removeOrigin(origin) {
  if (!origin) return false;
  if (origins === null) origins = getOrigins();
  const idx = origins.indexOf(origin);
  if (idx === -1) return false;
  origins.splice(idx, 1);
  await saveToRedisAndFile(origins);
  return true;
}

module.exports = {
  init,
  getOrigins,
  addOrigin,
  removeOrigin,
};
