const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
}

async function teardownTestDB() {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

async function clearDatabase() {
  const collections = Object.keys(mongoose.connection.collections);
  for (const collectionName of collections) {
    const collection = mongoose.connection.collections[collectionName];
    try {
      await collection.deleteMany();
    } catch (err) {}
  }
}

module.exports = { setupTestDB, teardownTestDB, clearDatabase };
