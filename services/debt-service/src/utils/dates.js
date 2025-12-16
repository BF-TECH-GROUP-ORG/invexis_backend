function monthKey(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function overdueDaysFrom(dueDate) {
    if (!dueDate) return 0;
    const now = new Date();
    return Math.max(0, Math.floor((now - new Date(dueDate)) / (1000 * 60 * 60 * 24)));
}

module.exports = { monthKey, overdueDaysFrom };
