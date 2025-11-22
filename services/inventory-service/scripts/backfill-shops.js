/**
 * Migration Script: Backfill Existing Shops as Warehouses
 * 
 * This script:
 * 1. Fetches all shops from the shop-service
 * 2. Creates warehouse entries for each shop in inventory-service
 * 3. Links shops to all products in their company via shopAvailability
 * 
 * Usage:
 *   node scripts/backfill-shops.js
 * 
 * Environment Variables Required:
 *   - SHOP_SERVICE_URL (default: http://shop-service:3002)
 *   - MONGODB_URI (for inventory database)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

// Import models
const Product = require('../src/models/Product');

// Configuration
const SHOP_SERVICE_URL = process.env.SHOP_SERVICE_URL || 'http://shop-service:3002';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://invexis:invexispass@mongodb:27017/inventory_db?authSource=admin';

// Logger
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`)
};

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.success('Connected to MongoDB');
  } catch (error) {
    logger.error(`Failed to connect to MongoDB: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch all shops from shop-service
 */
async function fetchAllShops() {
  try {
    logger.info('Fetching shops from shop-service...');

    // Note: This assumes shop-service has an endpoint to get all shops
    // You may need to adjust the endpoint based on your actual API
    const response = await axios.get(`${SHOP_SERVICE_URL}/api/v1/shops/all`, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const shops = response.data.data || response.data;
    logger.success(`Fetched ${shops.length} shops`);
    return shops;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logger.error('Cannot connect to shop-service. Is it running?');
    } else {
      logger.error(`Failed to fetch shops: ${error.message}`);
    }
    throw error;
  }
}

// Note: Warehouse model has been removed from this service.
// This script will only link shops to products via shopAvailability
// and set shop-related fields on products where appropriate.

/**
 * Link shop to all products in the company
 */
async function linkShopToProducts(shop) {
  try {
    // Add shop to shopAvailability for all active products in the company
    const result = await Product.updateMany(
      {
        companyId: shop.company_id,
        status: { $in: ['active', 'draft'] },
        // Only add if not already present
        'shopAvailability.shopId': { $ne: shop.id }
      },
      {
        $addToSet: {
          shopAvailability: {
            shopId: shop.id,
            enabled: shop.status === 'open',
            displayOrder: 0,
            customPrice: null,
            addedAt: new Date(),
            updatedAt: new Date()
          }
        }
      }
    );

    logger.success(`Linked shop ${shop.name} to ${result.modifiedCount} products`);
    return result.modifiedCount;
  } catch (error) {
    logger.error(`Failed to link shop ${shop.name} to products: ${error.message}`);
    throw error;
  }
}

/**
 * Process a single shop
 */
async function processShop(shop) {
  logger.info(`\n📦 Processing shop: ${shop.name} (${shop.id})`);

  try {
    // Link shop to products
    const linkedCount = await linkShopToProducts(shop);

    // Optionally: set a default shopId on products that don't have one
    // Here we will NOT overwrite existing product.shopId values. If desired,
    // you can uncomment the update below to set product.shopId to this shop
    // for products that currently have null shopId.
    //
    // await Product.updateMany(
    //   { companyId: shop.company_id, shopId: { $in: [null, undefined] } },
    //   { $set: { shopId: shop.id } }
    // );

    return {
      shopId: shop.id,
      shopName: shop.name,
      warehouseId: null,
      productsLinked: linkedCount,
      success: true
    };
  } catch (error) {
    logger.error(`Failed to process shop ${shop.name}: ${error.message}`);
    return {
      shopId: shop.id,
      shopName: shop.name,
      error: error.message,
      success: false
    };
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  logger.info('🚀 Starting shop backfill migration...\n');

  const startTime = Date.now();
  const results = {
    total: 0,
    successful: 0,
    failed: 0,
    details: []
  };

  try {
    // 1. Connect to database
    await connectDatabase();

    // 2. Fetch all shops
    const shops = await fetchAllShops();
    results.total = shops.length;

    if (shops.length === 0) {
      logger.warn('No shops found to process');
      return results;
    }

    // 3. Process each shop
    logger.info(`\n📋 Processing ${shops.length} shops...\n`);

    for (const shop of shops) {
      const result = await processShop(shop);
      results.details.push(result);

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }
    }

    // 4. Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('\n' + '='.repeat(60));
    logger.info('📊 MIGRATION SUMMARY');
    logger.info('='.repeat(60));
    logger.success(`Total shops processed: ${results.total}`);
    logger.success(`Successful: ${results.successful}`);
    if (results.failed > 0) {
      logger.error(`Failed: ${results.failed}`);
    }
    logger.info(`Duration: ${duration}s`);
    logger.info('='.repeat(60) + '\n');

    // 5. Show failed shops if any
    if (results.failed > 0) {
      logger.warn('Failed shops:');
      results.details
        .filter(r => !r.success)
        .forEach(r => {
          logger.error(`  - ${r.shopName} (${r.shopId}): ${r.error}`);
        });
    }

    return results;
  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

/**
 * Run the migration
 */
if (require.main === module) {
  runMigration()
    .then((results) => {
      if (results.failed === 0) {
        logger.success('\n🎉 Migration completed successfully!');
        process.exit(0);
      } else {
        logger.warn('\n⚠️  Migration completed with errors');
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error(`\n💥 Migration failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { runMigration };

