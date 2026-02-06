const rabbitmq = require('/app/shared/rabbitmq');

/**
 * Initialize RabbitMQ Connection for Report Service
 */
const initRabbitMQ = async () => {
    try {
        await rabbitmq.connect();
        console.log("✅ Report Service connected to RabbitMQ");
        return rabbitmq;
    } catch (error) {
        console.error("❌ RabbitMQ Connection Failed:", error);
        throw error;
    }
};

module.exports = {
    initRabbitMQ,
    client: rabbitmq
};
