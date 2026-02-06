const mongoose = require('mongoose');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

// Load Models
const SalesDocument = require('./models/SalesDocument');
const DebtDocument = require('./models/DebtDocument');
const SalesReport = require('./models/SalesReport');
const InventoryReport = require('./models/InventoryReport');
const FinanceReport = require('./models/FinanceReport');
const PerformanceReport = require('./models/PerformanceReport');
const PaymentDocument = require('./models/PaymentDocument');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/documentdb';

const SEED_CONFIG = {
    companyId: 'company_test_01',
    shopId: 'shop_test_01',
    docPerType: 200
};

const mockUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.pdf';

const generateDocuments = async () => {
    console.log('🚀 Starting Document Seeding...');

    const types = [
        { model: SalesDocument, name: 'Sales Document', docType: 'invoice' },
        { model: DebtDocument, name: 'Debt Document', docType: 'payment_receipt' },
        { model: SalesReport, name: 'Sales Report', isReport: true },
        { model: InventoryReport, name: 'Inventory Report', isReport: true, category: 'VALUATION' },
        { model: FinanceReport, name: 'Finance Report', isReport: true, financeType: 'EXECUTIVE' },
        { model: PerformanceReport, name: 'Performance Report', isReport: true, target: 'STAFF' },
        { model: PaymentDocument, name: 'Payment Document', docType: 'REMITTANCE' }
    ];

    for (const type of types) {
        console.log(`  📄 Generating ${SEED_CONFIG.docPerType} ${type.name}s...`);
        const docs = [];
        for (let i = 0; i < SEED_CONFIG.docPerType; i++) {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 90));

            const docId = uuidv4();
            const baseDoc = {
                documentId: docId,
                displayName: `${type.name} #${i + 1000}`,
                owner: {
                    level: 'shop',
                    companyId: SEED_CONFIG.companyId,
                    shopId: SEED_CONFIG.shopId
                },
                storage: {
                    provider: 'cloudinary',
                    url: mockUrl,
                    public_id: `test/docs/${docId}`,
                    format: 'pdf',
                    size: Math.floor(Math.random() * 500000) + 50000
                },
                metadata: new Map([
                    ['generatedBy', 'Seed Script'],
                    ['source', 'Internal System'],
                    ['environment', 'Production-Test']
                ]),
                createdAt: date
            };

            if (type.docType) {
                baseDoc.type = type.docType;
            }

            if (type.isReport) {
                baseDoc.period = {
                    start: new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000),
                    end: date
                };
            }

            // Required fields for specific models
            if (type.model === InventoryReport) {
                baseDoc.category = type.category;
            }
            if (type.model === FinanceReport) {
                baseDoc.type = type.financeType;
            }
            if (type.model === PerformanceReport) {
                baseDoc.target = type.target;
                baseDoc.targetId = `staff_${Math.floor(Math.random() * 10)}`;
            }

            // Special fields for DebtDocument
            if (type.model === DebtDocument) {
                baseDoc.reference = {
                    invoiceNo: `INV-2026-${String(i).padStart(4, '0')}`,
                    saleId: `sale_${i}`,
                    customerId: `cust_${Math.floor(Math.random() * 100)}`
                };
            }

            docs.push(baseDoc);
        }
        await type.model.insertMany(docs);
        console.log(`    ✅ ${type.name}s seeded.`);
    }
};

const seed = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB for seeding document-service');

        // Cleanup existing test data
        console.log('🧹 Cleaning up existing test data...');
        const models = [SalesDocument, DebtDocument, SalesReport, InventoryReport, FinanceReport, PerformanceReport, PaymentDocument];
        for (const model of models) {
            await model.deleteMany({ "owner.companyId": SEED_CONFIG.companyId });
        }

        await generateDocuments();

        console.log('✨ ALL CLEAR. Document Service Seeding Complete.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding Error:', error);
        process.exit(1);
    }
};

seed();
