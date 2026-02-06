const mongoose = require('mongoose');
require('dotenv').config();

// Load Models
const SalesTransaction = require('./models/SalesTransaction');
const DailySnapshot = require('./models/DailySnapshot');
const PaymentLog = require('./models/PaymentLog');
const ProductDailySnapshot = require('./models/ProductDailySnapshot');

const connectDB = require('./config/database');

const SEED_CONFIG = {
    companyId: process.env.SEED_COMPANY_ID || 'company_test_01',
    shopId: process.env.SEED_SHOP_ID || 'shop_test_01',
    transactionCount: parseInt(process.env.SEED_COUNT) || 2000,
    daysToBackfill: parseInt(process.env.SEED_DAYS) || 90
};

const productPool = [
    { id: 'prod_001', name: 'Premium Coffee Beans', category: 'Beverages', price: 25000, cost: 15000 },
    { id: 'prod_002', name: 'Organic Green Tea', category: 'Beverages', price: 15000, cost: 8000 },
    { id: 'prod_003', name: 'Fresh Milk 1L', category: 'Dairy', price: 1200, cost: 800 },
    { id: 'prod_004', name: 'Wheat Bread', category: 'Bakery', price: 2000, cost: 1200 },
    { id: 'prod_005', name: 'Chocolate Bar', category: 'Snacks', price: 5000, cost: 3000 },
    { id: 'prod_006', name: 'Washing Powder', category: 'Household', price: 8000, cost: 5000 },
    { id: 'prod_007', name: 'Cooking Oil 5L', category: 'Pantry', price: 12000, cost: 8000 },
    { id: 'prod_008', name: 'Basmati Rice 5kg', category: 'Pantry', price: 18000, cost: 12000 },
    { id: 'prod_009', name: 'Pasta 500g', category: 'Pantry', price: 3000, cost: 1800 },
    { id: 'prod_010', name: 'Tomato Sauce', category: 'Pantry', price: 2500, cost: 1500 }
];

const staffPool = ['John Doe', 'Jane Smith', 'Bob Wilson', 'Alice Brown'];
const customers = ['Walk-in', 'TechCorp Ltd', 'Local Mart', 'Individual Client'];

const generateSales = async () => {
    console.log('🚀 Starting Sales Transaction Seeding...');
    const transactions = [];

    for (let i = 0; i < SEED_CONFIG.transactionCount; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * SEED_CONFIG.daysToBackfill));

        const itemCount = Math.floor(Math.random() * 5) + 1;
        const items = [];
        let totalAmount = 0;

        for (let j = 0; j < itemCount; j++) {
            const product = productPool[Math.floor(Math.random() * productPool.length)];
            const qty = Math.floor(Math.random() * 10) + 1;
            const lineTotal = product.price * qty;

            items.push({
                productId: product.id,
                productName: product.name,
                category: product.category,
                qtySold: qty,
                netQty: qty,
                unitPrice: product.price,
                totalAmount: lineTotal,
                soldBy: staffPool[Math.floor(Math.random() * staffPool.length)]
            });
            totalAmount += lineTotal;
        }

        const isDebt = Math.random() > 0.8;
        const debtStatus = isDebt ? (Math.random() > 0.5 ? 'Pending' : 'Overdue') : 'Paid';

        transactions.push({
            companyId: SEED_CONFIG.companyId,
            shopId: SEED_CONFIG.shopId,
            date: date,
            invoiceNo: `INV-${date.getFullYear()}-${String(i).padStart(4, '0')}`,
            saleId: `sale_${i}_${Date.now()}`,
            customer: {
                name: customers[Math.floor(Math.random() * customers.length)],
                type: Math.random() > 0.7 ? 'Corporate' : 'Retail',
                id: `cust_${Math.floor(Math.random() * 100)}`
            },
            soldBy: staffPool[Math.floor(Math.random() * staffPool.length)],
            saleTime: `${Math.floor(Math.random() * 12) + 1}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')} ${Math.random() > 0.5 ? 'AM' : 'PM'}`,
            items,
            totalAmount,
            paymentMethod: Math.random() > 0.5 ? 'MoMo' : 'Cash',
            debt: {
                isDebt,
                originalAmount: totalAmount,
                amountPaid: isDebt ? 0 : totalAmount,
                balance: isDebt ? totalAmount : 0,
                status: debtStatus,
                dueDate: isDebt ? new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000) : null
            }
        });

        if (transactions.length >= 500) {
            await SalesTransaction.insertMany(transactions);
            console.log(`✅ Seeded ${i + 1} transactions...`);
            transactions.length = 0;
        }
    }

    if (transactions.length > 0) {
        await SalesTransaction.insertMany(transactions);
    }
    console.log('✅ Sales Transactions Seeded Successfully!');
};

const generateSnapshots = async () => {
    console.log('🚀 Starting Snapshots Seeding...');
    const dailySnapshots = [];
    const productSnapshots = [];

    for (let i = 0; i < SEED_CONFIG.daysToBackfill; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        let dailyRevenue = 0;
        let dailyCost = 0;
        let dailyTransactionCount = 0;

        for (const product of productPool) {
            const unitsSold = Math.floor(Math.random() * 50);
            const grossSales = unitsSold * product.price;
            const costOfGoods = unitsSold * product.cost;
            const transCount = Math.floor(Math.random() * 10);

            dailyRevenue += grossSales;
            dailyCost += costOfGoods;
            dailyTransactionCount += transCount;

            productSnapshots.push({
                date: dateStr,
                companyId: SEED_CONFIG.companyId,
                shopId: SEED_CONFIG.shopId,
                productId: product.id,
                productName: product.name,
                categoryId: product.category,
                inventory: {
                    initialStock: 1000,
                    remainingStock: 1000 - unitsSold,
                    stockValue: (1000 - unitsSold) * product.cost
                },
                movement: {
                    in: 0,
                    out: unitsSold
                },
                sales: {
                    grossSales,
                    discounts: grossSales * 0.05,
                    netSales: grossSales * 0.95,
                    unitsSold,
                    transactionCount: transCount
                },
                financials: {
                    costOfGoods,
                    grossProfit: grossSales - costOfGoods,
                    marginPercent: ((grossSales - costOfGoods) / grossSales) * 100 || 0
                }
            });
        }

        dailySnapshots.push({
            date: dateStr,
            companyId: SEED_CONFIG.companyId,
            shopId: SEED_CONFIG.shopId,
            sales: {
                totalRevenue: dailyRevenue,
                totalCost: dailyCost,
                grossProfit: dailyRevenue - dailyCost,
                netProfit: (dailyRevenue - dailyCost) * 0.8,
                transactionCount: dailyTransactionCount,
                avgBasketSize: dailyRevenue / dailyTransactionCount || 0,
                discountTotal: dailyRevenue * 0.05
            },
            inventory: {
                totalValue: Math.floor(Math.random() * 50000000) + 10000000,
                itemsInStock: Math.floor(Math.random() * 1000) + 500,
                lowStockItems: Math.floor(Math.random() * 20),
                outOfStockItems: Math.floor(Math.random() * 5)
            },
            finance: {
                cashIn: dailyRevenue * 0.9,
                cashOut: dailyRevenue * 0.4,
                debtIncurred: dailyRevenue * 0.1,
                debtRepaid: dailyRevenue * 0.05
            },
            performance: {
                topStaffId: staffPool[Math.floor(Math.random() * staffPool.length)],
                topProductId: productPool[Math.floor(Math.random() * productPool.length)].id
            }
        });
    }

    await DailySnapshot.insertMany(dailySnapshots);
    await ProductDailySnapshot.insertMany(productSnapshots);
    console.log('✅ Daily and Product Snapshots Seeded Successfully!');
};

const seed = async () => {
    try {
        await connectDB();

        // Clear existing data for the test accounts
        console.log('🧹 Cleaning up existing test data...');
        await SalesTransaction.deleteMany({ companyId: SEED_CONFIG.companyId });
        await DailySnapshot.deleteMany({ companyId: SEED_CONFIG.companyId });
        await PaymentLog.deleteMany({ companyId: SEED_CONFIG.companyId });
        await ProductDailySnapshot.deleteMany({ companyId: SEED_CONFIG.companyId });

        await generateSales();
        await generateSnapshots();

        console.log('✨ ALL CLEAR. Report Service Seeding Complete.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding Error:', error);
        process.exit(1);
    }
};

seed();
