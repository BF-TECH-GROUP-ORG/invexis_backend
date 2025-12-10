// Prometheus-style metrics for observability
// Metrics are stored in memory and exported in Prometheus text format

const metrics = {
    // Counters (monotonically increasing)
    queueItemsPersisted: 0,      // total items persisted from write_queue
    queueItemsPersistedByType: { debt: 0, repayment: 0, event: 0, summary: 0 }, // breakdown by type
    persistenceErrors: 0,         // total persistence errors

    // Gauges (point-in-time values)
    currentQueueDepth: 0,         // current items in write_queue (updated by external caller)
    debtsInMemory: 0,            // current debts in inMemoryStore map
    repaymentsInMemory: 0,       // current repayments in inMemoryStore map

    // Histograms (request/batch response times in ms)
    responseTimeBuckets: [1, 5, 10, 50, 100, 500, 1000, 5000], // bucket thresholds in ms
    responseTimeSum: 0,           // total response time (for average)
    responseTimeCount: 0,         // count of responses
    responseTimeHistogram: {},    // { 1: count, 5: count, ... }

    persistBatchTimeBuckets: [10, 50, 100, 200, 500, 1000], // batch duration buckets
    persistBatchTimeSum: 0,
    persistBatchTimeCount: 0,
    persistBatchTimeHistogram: {},
};

// Initialize histogram buckets
metrics.responseTimeBuckets.forEach(b => { metrics.responseTimeHistogram[b] = 0; });
metrics.persistBatchTimeBuckets.forEach(b => { metrics.persistBatchTimeHistogram[b] = 0; });

function recordPersisted(type = 'debt') {
    metrics.queueItemsPersisted++;
    if (metrics.queueItemsPersistedByType[type] !== undefined) {
        metrics.queueItemsPersistedByType[type]++;
    }
}

function recordPersistenceError() {
    metrics.persistenceErrors++;
}

function recordResponseTime(durationMs) {
    metrics.responseTimeSum += durationMs;
    metrics.responseTimeCount++;
    // Increment histogram buckets
    metrics.responseTimeBuckets.forEach(b => {
        if (durationMs <= b) metrics.responseTimeHistogram[b]++;
    });
}

function recordPersistBatchTime(durationMs) {
    metrics.persistBatchTimeSum += durationMs;
    metrics.persistBatchTimeCount++;
    // Increment histogram buckets
    metrics.persistBatchTimeBuckets.forEach(b => {
        if (durationMs <= b) metrics.persistBatchTimeHistogram[b]++;
    });
}

function updateQueueDepth(depth) {
    metrics.currentQueueDepth = depth;
}

function updateInMemoryDebts(count) {
    metrics.debtsInMemory = count;
}

function updateInMemoryRepayments(count) {
    metrics.repaymentsInMemory = count;
}

function getMetricsText() {
    // Prometheus text format: HELP, TYPE, then samples
    let out = '';

    // Counter: total items persisted
    out += '# HELP debt_service_queue_items_persisted_total Total items persisted from write_queue\n';
    out += '# TYPE debt_service_queue_items_persisted_total counter\n';
    out += `debt_service_queue_items_persisted_total ${metrics.queueItemsPersisted}\n\n`;

    // Counter: items persisted by type
    out += '# HELP debt_service_queue_items_persisted_by_type Items persisted by type\n';
    out += '# TYPE debt_service_queue_items_persisted_by_type counter\n';
    Object.entries(metrics.queueItemsPersistedByType).forEach(([type, count]) => {
        out += `debt_service_queue_items_persisted_by_type{type="${type}"} ${count}\n`;
    });
    out += '\n';

    // Counter: persistence errors
    out += '# HELP debt_service_persistence_errors_total Total persistence errors\n';
    out += '# TYPE debt_service_persistence_errors_total counter\n';
    out += `debt_service_persistence_errors_total ${metrics.persistenceErrors}\n\n`;

    // Gauge: current queue depth
    out += '# HELP debt_service_queue_depth_current Current items in write_queue\n';
    out += '# TYPE debt_service_queue_depth_current gauge\n';
    out += `debt_service_queue_depth_current ${metrics.currentQueueDepth}\n\n`;

    // Gauge: in-memory stores
    out += '# HELP debt_service_in_memory_debts In-memory debts count\n';
    out += '# TYPE debt_service_in_memory_debts gauge\n';
    out += `debt_service_in_memory_debts ${metrics.debtsInMemory}\n\n`;

    out += '# HELP debt_service_in_memory_repayments In-memory repayments count\n';
    out += '# TYPE debt_service_in_memory_repayments gauge\n';
    out += `debt_service_in_memory_repayments ${metrics.repaymentsInMemory}\n\n`;

    // Histogram: response time
    out += '# HELP debt_service_response_time_ms HTTP response time in milliseconds\n';
    out += '# TYPE debt_service_response_time_ms histogram\n';
    metrics.responseTimeBuckets.forEach(b => {
        out += `debt_service_response_time_ms_bucket{le="${b}"} ${metrics.responseTimeHistogram[b]}\n`;
    });
    out += `debt_service_response_time_ms_bucket{le="+Inf"} ${metrics.responseTimeCount}\n`;
    out += `debt_service_response_time_ms_sum ${metrics.responseTimeSum}\n`;
    out += `debt_service_response_time_ms_count ${metrics.responseTimeCount}\n\n`;

    // Histogram: persist batch time
    out += '# HELP debt_service_persist_batch_time_ms Persist batch duration in milliseconds\n';
    out += '# TYPE debt_service_persist_batch_time_ms histogram\n';
    metrics.persistBatchTimeBuckets.forEach(b => {
        out += `debt_service_persist_batch_time_ms_bucket{le="${b}"} ${metrics.persistBatchTimeHistogram[b]}\n`;
    });
    out += `debt_service_persist_batch_time_ms_bucket{le="+Inf"} ${metrics.persistBatchTimeCount}\n`;
    out += `debt_service_persist_batch_time_ms_sum ${metrics.persistBatchTimeSum}\n`;
    out += `debt_service_persist_batch_time_ms_count ${metrics.persistBatchTimeCount}\n`;

    return out;
}

module.exports = {
    recordPersisted,
    recordPersistenceError,
    recordResponseTime,
    recordPersistBatchTime,
    updateQueueDepth,
    updateInMemoryDebts,
    updateInMemoryRepayments,
    getMetricsText,
};
