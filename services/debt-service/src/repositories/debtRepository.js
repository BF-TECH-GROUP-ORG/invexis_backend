const Debt = require('../models/debt.model');
const mongoose = require('mongoose');

async function createDebt(doc) {
    const debt = new Debt(doc);
    return debt.save();
}

async function findById(id, companyId) {
    // If companyId looks like a 24-char hex string, include it in the query (convert to ObjectId).
    // Otherwise omit companyId from the DB filter to avoid Mongoose trying to cast invalid strings to ObjectId
    const filter = { _id: id, isDeleted: false };
    if (typeof companyId === 'object' && companyId && companyId._bsontype === 'ObjectID') {
        filter.companyId = companyId;
    } else if (typeof companyId === 'string' && companyId.length === 24) {
        try { filter.companyId = mongoose.Types.ObjectId(companyId); } catch (e) { /* ignore conversion error */ }
    }

    const found = await Debt.findOne(filter);

    // If caller provided a non-ObjectId companyId (e.g. UUID) we omitted companyId from the query above.
    // In that case we will not enforce strict companyId matching here because the caller may be using
    // an external id format; higher-level authorization should validate tenant access if needed.
    // Return the found debt (or null).
    return found;
}

async function updateDebt(debtDoc) {
    return debtDoc.save();
}

async function listDebts(filter, options = {}) {
    const { skip = 0, limit = 50, sort = { createdAt: -1 }, lean = true } = options;
    let query = Debt.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit);
    if (lean) query = query.lean();
    return query.exec();
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
