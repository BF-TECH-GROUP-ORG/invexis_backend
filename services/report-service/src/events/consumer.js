const { subscribe } = require('/app/shared/rabbitmq');
const salesHandler = require('./handlers/salesHandler');
const inventoryHandler = require('./handlers/inventoryHandler');
const financeHandler = require('./handlers/financeHandler');

const registerConsumers = async () => {
    // We use the wrapper's subscribe method which handles queue creation and binding
    const exchange = 'events_topic';

    // 1. Sales Consumer
    await subscribe({
        queue: 'report_service_sales_queue',
        exchange,
        pattern: 'sale.#'
    }, salesHandler);

    // 2. Inventory Consumer
    await subscribe({
        queue: 'report_service_inventory_queue',
        exchange,
        pattern: 'inventory.#'
    }, inventoryHandler);

    // 3. Finance Consumer
    await subscribe({
        queue: 'report_service_debt_queue',
        exchange,
        pattern: 'debt.#'
    }, financeHandler);

    console.log("🎧 Report Service Consumers Registered");
};

module.exports = registerConsumers;
