function hrtimeToMs(start) {
    const diff = process.hrtime.bigint() - start;
    return Number(diff) / 1e6; // ms
}

/**
 * measureAsync
 * - Logs only when duration exceeds PERF_LOG_THRESHOLD_MS (default 5ms)
 * - Set PERF_LOG_ALWAYS=true to always log
 * - This reduces noisy output from frequent empty jobs
 */
async function measureAsync(label, fn) {
    const start = process.hrtime.bigint();
    try {
        const result = await fn();
        const ms = Number(hrtimeToMs(start));
        const threshold = Number(process.env.PERF_LOG_THRESHOLD_MS || 5);
        const always = process.env.PERF_LOG_ALWAYS === 'true';
        const enabled = process.env.PERF_LOG_ENABLED !== 'false';
        if ((always || ms >= threshold) && enabled) {
            console.debug(`[perf] ${label} -> ${ms.toFixed(3)} ms`);
        }
        return result;
    } catch (err) {
        const ms = Number(hrtimeToMs(start));
        const threshold = Number(process.env.PERF_LOG_THRESHOLD_MS || 5);
        const always = process.env.PERF_LOG_ALWAYS === 'true';
        if (always || ms >= threshold) {
            console.debug(`[perf] ${label} (failed) -> ${ms.toFixed(3)} ms`);
        }
        throw err;
    }
}

module.exports = { measureAsync };
