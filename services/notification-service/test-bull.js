const Queue = require('bull');
const redisInstance = require('/home/mama/Desktop/projects/invexis/invexis_backend/shared/redis');

// Emulate how we did it in queue.js
const createClient = (type) => {
    const options = { ...redisInstance.client.options };
    
    switch (type) {
        case 'client':
            return redisInstance.client;
        case 'subscriber':
            options.maxRetriesPerRequest = null;
            options.enableReadyCheck = false;
            return new redisInstance.client.constructor(options);
        case 'bclient':
            options.maxRetriesPerRequest = null;
            options.enableReadyCheck = false;
            return new redisInstance.client.constructor(options);
        default:
            return redisInstance.client;
    }
};

const q = new Queue('test', { createClient });

q.on('ready', async () => {
    console.log("Queue is ready!");
    await q.close();
    await redisInstance.close();
    process.exit(0);
});
q.on('error', (err) => {
    console.error("Queue error:", err);
    process.exit(1);
});
