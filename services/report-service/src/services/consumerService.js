const rabbitmq = require('/app/shared/rabbitmq.js');
const logger = require('../config/logger');
const salesHandlers = require('./handlers/salesHandlers');
const inventoryHandlers = require('./handlers/inventoryHandlers');
const productHandlers = require('./handlers/productHandlers');
const financialHandlers = require('./handlers/financialHandlers');
const companySystemHandlers = require('./handlers/companySystemHandlers');
const auditHandlers = require('./handlers/auditHandlers');

const startConsumer = async () => {
    try {
        await rabbitmq.connect();
        logger.info('Report Service connected to RabbitMQ (Shared)');

        const queueName = 'report_service_events';
        const exchange = 'events_topic';

        // 1. Sales & Returns
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'sale.#' }, async (event) => {
            await salesHandlers.handle(event);
        });

        // 2. Inventory & Products
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'inventory.#' }, async (event) => {
            if (event.type.startsWith('inventory.product.')) {
                await productHandlers.handle(event);
            } else {
                await inventoryHandlers.handle(event);
            }
        });
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'product.#' }, async (event) => {
            await productHandlers.handle(event);
        });

        // 3. Financial (Debts & Payments)
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'debt.#' }, async (event) => {
            await financialHandlers.handle(event);
        });
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'payment.#' }, async (event) => {
            await financialHandlers.handle(event);
        });

        // 4. Company/Shop/System
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'company.#' }, async (event) => {
            if (companySystemHandlers.handle) await companySystemHandlers.handle(event);
        });
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'shop.#' }, async (event) => {
            if (companySystemHandlers.handle) await companySystemHandlers.handle(event);
        });

        // 5. Audit
        await rabbitmq.subscribe({ queue: queueName, exchange, pattern: 'action.#' }, async (event) => {
            await auditHandlers.handle(event);
        });

        logger.info(`Report Service handlers subscribed to ${queueName}`);

    } catch (err) {
        logger.error('Failed to start consumer', err);
    }
};

module.exports = { startConsumer };
