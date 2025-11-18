const Repayment = require('../models/repayment.model');

async function createRepayment(doc) {
    const r = new Repayment(doc);
    return r.save();
}

async function aggregateRepayments(matchStage) {
    return Repayment.aggregate([{ $match: matchStage }, { $group: { _id: null, totalRepaid: { $sum: '$amountPaid' } } }]);
}

module.exports = { createRepayment, aggregateRepayments };
