function requireFields(obj, fields) {
    const missing = [];
    for (const f of fields) if (obj[f] === undefined || obj[f] === null) missing.push(f);
    if (missing.length) throw new Error(`Missing required fields: ${missing.join(',')}`);
}

module.exports = { requireFields };
