const Debt = require('../models/debt.model');
const Repayment = require('../models/repayment.model');
const CompanySummary = require('../models/company_summery.model');
const ShopSummary = require('../models/shop_summery.model');
const CustomerSummary = require('../models/customer_summery.model');
const CrossCompanySummary = require('../models/cross_company_summary.model');

// Helper to generate ObjectId
const mongoose = require('mongoose');
function oid() { return new mongoose.Types.ObjectId(); }

async function seedAllModels(req, res) {
    try {
        // Clear collections
        await Promise.all([
            Debt.deleteMany({}),
            Repayment.deleteMany({}),
            CompanySummary.deleteMany({}),
            ShopSummary.deleteMany({}),
            CustomerSummary.deleteMany({}),
            CrossCompanySummary.deleteMany({})
        ]);

        // Seed debts
        const companyId = oid();
        const shopId = oid();
        const customerId = oid();
        const hashedCustomerId = 'h_demo_123';
        const debt1 = await Debt.create({
            companyId, shopId, customerId,
            hashedCustomerId,
            salesId: oid(), salesStaffId: oid(),
            items: [{ itemId: oid(), quantity: 2, unitPrice: 50, totalPrice: 100 }],
            totalAmount: 100, amountPaidNow: 50, balance: 50,
            status: 'PARTIALLY_PAID', dueDate: new Date(), shareLevel: 'FULL',
            balanceHistory: [{ date: new Date(), balance: 50 }]
        });
        const debt2 = await Debt.create({
            companyId, shopId, customerId,
            hashedCustomerId,
            salesId: oid(), salesStaffId: oid(),
            items: [{ itemId: oid(), quantity: 1, unitPrice: 200, totalPrice: 200 }],
            totalAmount: 200, amountPaidNow: 0, balance: 200,
            status: 'UNPAID', dueDate: new Date(), shareLevel: 'PARTIAL',
            balanceHistory: [{ date: new Date(), balance: 200 }]
        });

        // Seed repayments
        const repayment1 = await Repayment.create({
            companyId, shopId, customerId, debtId: debt1._id,
            paymentId: oid(), amountPaid: 50, paymentMethod: 'CASH',
            paymentReference: 'SEED-REF-1', paidAt: new Date()
        });

        // Seed summaries
        await CompanySummary.create({
            companyId,
            totalOutstanding: 250,
            numActiveDebts: 2,
            largestDebt: 200,
            avgDaysOverdue: 0,
            lastActivityAt: new Date(),
            lastUpdated: new Date()
        });
        await ShopSummary.create({
            shopId,
            totalOutstanding: 250,
            numActiveDebts: 2,
            largestDebt: 200,
            avgDaysOverdue: 0,
            lastActivityAt: new Date(),
            lastUpdated: new Date()
        });
        await CustomerSummary.create({
            customerId,
            totalOutstanding: 250,
            numActiveDebts: 2,
            largestDebt: 200,
            avgDaysOverdue: 0,
            lastActivityAt: new Date(),
            lastUpdated: new Date()
        });
        await CrossCompanySummary.create({
            hashedCustomerId,
            totalOutstanding: 250,
            numActiveDebts: 2,
            largestDebt: 200,
            avgDaysOverdue: 0,
            numCompaniesWithDebt: 1,
            companies: [companyId],
            riskScore: 2,
            riskLabel: 'FAIR',
            worstShareLevel: 'FULL',
            lastActivityAt: new Date(),
            lastUpdated: new Date()
        });

        res.json({ success: true, message: 'Seeded all models', companyId, shopId, customerId, hashedCustomerId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { seedAllModels };
