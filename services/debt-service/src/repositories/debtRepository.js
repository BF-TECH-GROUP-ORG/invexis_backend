const Debt = require('../models/debt.model');

async function createDebt(doc) {
    const debt = new Debt(doc);
    return debt.save();
}

async function findById(id, companyId) {
    return Debt.findOne({ _id: id, companyId, isDeleted: false });
}

async function updateDebt(debtDoc) {
    return debtDoc.save();
}

async function listDebts(filter, options = {}) {
    const { skip = 0, limit = 50, sort = { createdAt: -1 }, lean = true } = options;
    let query = Debt.find(filter).sort(sort).skip(skip).limit(limit);
    if (lean) query = query.lean();
    return query;
}

async function countDebts(filter) {
    return Debt.countDocuments(filter);
}

async function findOverdueUnpaid(beforeDate, limit = 200) {
    return Debt.find({ dueDate: { $exists: true, $lt: beforeDate }, status: { $ne: 'PAID' }, isDeleted: false }).limit(limit);
}

async function findByHashedCustomerId(hashedCustomerId, options = {}) {
    const { skip = 0, limit = 100, lean = true } = options;
    let query = Debt.find({ hashedCustomerId, isDeleted: false }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    if (lean) query = query.lean();
    return query;
}

module.exports = {
    createDebt,
    findById,
    updateDebt,
    listDebts,
    countDebts,
    findOverdueUnpaid
};
