function hrtimeToMs(start) {
    const diff = process.hrtime.bigint() - start;
    return Number(diff) / 1e6; // ms
}

async function measureAsync(label, fn) {
    const start = process.hrtime.bigint();
    try {
        const result = await fn();
        const ms = hrtimeToMs(start).toFixed(3);
        console.debug(`[perf] ${label} -> ${ms} ms`);
        return result;
    } catch (err) {
        const ms = hrtimeToMs(start).toFixed(3);
        console.debug(`[perf] ${label} (failed) -> ${ms} ms`);
        throw err;
    }
}

module.exports = { measureAsync };
