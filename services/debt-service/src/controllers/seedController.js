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
        console.log('🌱 Starting database seed...');

        // Clear collections
        console.log('🧹 Clearing existing collections...');
        await Promise.all([
            Debt.deleteMany({}),
            Repayment.deleteMany({}),
            CompanySummary.deleteMany({}),
            ShopSummary.deleteMany({}),
            CustomerSummary.deleteMany({}),
            CrossCompanySummary.deleteMany({})
        ]);
        console.log('✓ Collections cleared');

        // Generate consistent IDs
        const companyId = oid();
        const shopId = oid();
        const customerId = oid();
        const hashedCustomerId = 'h_demo_' + companyId.toString().slice(-6);
        const salesId = oid();
        const salesStaffId = oid();
        const itemId1 = oid();
        const itemId2 = oid();
        const paymentId = oid();

        console.log('📊 Creating seed data...');

        // Seed debts
        const debt1 = await Debt.create({
            companyId,
            shopId,
            customerId,
            customer: {
                id: customerId,
                name: 'John Doe',
                phone: '+256700123456'
            },
            hashedCustomerId,
            salesId,
            salesStaffId,
            items: [
                {
                    itemId: itemId1,
                    itemName: 'Bulk Rice - 50kg',
                    quantity: 2,
                    unitPrice: 50,
                    totalPrice: 100
                }
            ],
            totalAmount: 100,
            amountPaidNow: 50,
            balance: 50,
            status: 'PARTIALLY_PAID',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
            shareLevel: 'FULL',
            consentRef: 'CONSENT-' + companyId.toString().slice(-6),
            createdBy: {
                id: salesStaffId,
                name: 'Admin User'
            },
            balanceHistory: [
                { date: new Date(Date.now() - 24 * 60 * 60 * 1000), balance: 100 },
                { date: new Date(), balance: 50 }
            ]
        });

        const debt2 = await Debt.create({
            companyId,
            shopId,
            customerId,
            customer: {
                id: customerId,
                name: 'John Doe',
                phone: '+256700123456'
            },
            hashedCustomerId,
            salesId: oid(),
            salesStaffId,
            items: [
                {
                    itemId: itemId2,
                    itemName: 'Sugar - 25kg',
                    quantity: 1,
                    unitPrice: 200,
                    totalPrice: 200
                }
            ],
            totalAmount: 200,
            amountPaidNow: 0,
            balance: 200,
            status: 'UNPAID',
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Due in 14 days
            shareLevel: 'PARTIAL',
            consentRef: 'CONSENT-' + companyId.toString().slice(-6),
            createdBy: {
                id: salesStaffId,
                name: 'Admin User'
            },
            balanceHistory: [
                { date: new Date(), balance: 200 }
            ]
        });

        console.log('✓ Created 2 debts');

        // Seed repayments
        const repayment1 = await Repayment.create({
            companyId,
            shopId,
            customerId,
            customer: {
                id: customerId,
                name: 'John Doe',
                phone: '+256700123456'
            },
            debtId: debt1._id,
            paymentId,
            amountPaid: 50,
            paymentMethod: 'CASH',
            paymentReference: 'SEED-REF-001-' + Date.now(),
            createdBy: {
                id: salesStaffId,
                name: 'Admin User'
            },
            paidAt: new Date(Date.now() - 1 * 60 * 60 * 1000) // Paid 1 hour ago
        });

        console.log('✓ Created 1 repayment');

        // Seed CompanySummary
        await CompanySummary.create({
            companyId,
            totalOutstanding: 250,
            totalRepaid: 50,
            totalCreditSales: 300,
            overdueDebt: 0,
            monthlyTrend: [
                {
                    month: new Date().toISOString().slice(0, 7),
                    newDebts: 300,
                    repaid: 50,
                    outstanding: 250
                }
            ]
        });

        console.log('✓ Created CompanySummary');

        // Seed ShopSummary
        await ShopSummary.create({
            companyId,
            shopId,
            totalOutstanding: 250,
            totalRepaidThisMonth: 50,
            totalDebtCreatedThisMonth: 300,
            numberOfActiveDebts: 2,
            topCustomers: [
                {
                    customerId,
                    outstanding: 250
                }
            ]
        });

        console.log('✓ Created ShopSummary');

        // Seed CustomerSummary
        await CustomerSummary.create({
            companyId,
            customerId,
            totalDebts: 2,
            activeDebts: 2,
            paidDebts: 0,
            totalOutstanding: 250,
            totalRepaid: 50,
            largestDebt: 200,
            lastPaymentDate: new Date(Date.now() - 1 * 60 * 60 * 1000),
            riskRating: 'FAIR'
        });

        console.log('✓ Created CustomerSummary');

        // Seed CrossCompanySummary
        await CrossCompanySummary.create({
            hashedCustomerId,
            totalOutstanding: 250,
            numActiveDebts: 2,
            largestDebt: 200,
            avgDaysOverdue: 0,
            numCompaniesWithDebt: 1,
            companies: [companyId.toString()],
            riskScore: 5,
            riskLabel: 'FAIR',
            worstShareLevel: 'FULL',
            lastActivityAt: new Date()
        });

        console.log('✓ Created CrossCompanySummary');

        const seedData = {
            success: true,
            message: 'Database seeded successfully',
            data: {
                companyId: companyId.toString(),
                shopId: shopId.toString(),
                customerId: customerId.toString(),
                salesId: salesId.toString(),
                hashedCustomerId,
                debts: [debt1._id.toString(), debt2._id.toString()],
                repayments: [repayment1._id.toString()],
                summary: {
                    totalOutstanding: 250,
                    activeDebts: 2,
                    largestDebt: 200
                }
            }
        };

        console.log('✓ Seed completed successfully');
        res.status(201).json(seedData);
    } catch (err) {
        console.error('❌ Seed error:', err.message);
        res.status(500).json({
            success: false,
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
}

module.exports = { seedAllModels };
