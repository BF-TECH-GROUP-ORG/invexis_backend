/**
 * Company Event Handler
 * Handles company-related events from company-service
 * Manages company-level inventory cleanup
 */

const Product = require('../../models/Product');
const Category = require('../../models/Category');
const StockChange = require('../../models/StockChange');
const Alert = require('../../models/Alert');
const Discount = require('../../models/Discount');
const InventoryAdjustment = require('../../models/InventoryAdjustment');
const { logger } = require('../../utils/logger');

/**
 * Handle company deleted event - Cleanup all inventory data
 */
async function handleCompanyDeleted(data) {
  try {
    const { companyId } = data;

    logger.info(`🏢 Processing company deleted: ${companyId}`);

    // Delete all inventory data for this company
    const deletionResults = {
      products: 0,
      categories: 0,
      stockChanges: 0,
      alerts: 0,
      discounts: 0,
      adjustments: 0
    };

    // Delete products
    const productsResult = await Product.deleteMany({ companyId });
    deletionResults.products = productsResult.deletedCount;

    // Delete categories
    const categoriesResult = await Category.deleteMany({ companyId });
    deletionResults.categories = categoriesResult.deletedCount;

    // Warehouse model removed; no warehouse cleanup required here

    // Delete stock changes
    const stockChangesResult = await StockChange.deleteMany({ companyId });
    deletionResults.stockChanges = stockChangesResult.deletedCount;

    // Delete alerts
    const alertsResult = await Alert.deleteMany({ companyId });
    deletionResults.alerts = alertsResult.deletedCount;

    // Delete discounts
    const discountsResult = await Discount.deleteMany({ companyId });
    deletionResults.discounts = discountsResult.deletedCount;

    // Delete adjustments
    const adjustmentsResult = await InventoryAdjustment.deleteMany({ companyId });
    deletionResults.adjustments = adjustmentsResult.deletedCount;

    logger.info(
      `✅ Company ${companyId} inventory data deleted:`,
      deletionResults
    );
  } catch (error) {
    logger.error(`❌ Error handling company deleted: ${error.message}`);
    throw error;
  }
}

/**
 * Main handler function
 */
module.exports = async function handleCompanyEvent(event) {
  try {
    const { type, data } = event;

    logger.info(`🏢 Processing company event: ${type}`);

    switch (type) {
      case 'company.created':
        // No action needed for inventory service on company creation
        logger.info(`✅ Company created acknowledged: ${data.companyId || 'unknown'}`);
        break;

      case 'company.deleted':
        await handleCompanyDeleted(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled company event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling company event: ${error.message}`);
    throw error;
  }
};

