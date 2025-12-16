const sequelize = require("../src/config/database");
// Models must be imported to be registered with Sequelize
const AnalyticsEvent = require("../src/models/AnalyticsEvent.model");
const SalesMetric = require("../src/models/SalesMetric.model");
const InventoryMetric = require("../src/models/InventoryMetric.model");

const resetDatabase = async () => {
    try {
        await sequelize.authenticate();
        console.log("✅ Database connection established");

        // DROP Tables to clear bad schema (Standard tables with wrong PK)
        console.log("⚠️ Dropping existing tables to reset schema for Hypertables...");
        await sequelize.query("DROP MATERIALIZED VIEW IF EXISTS sales_daily_summary CASCADE;");
        await sequelize.query("DROP TABLE IF EXISTS sales_metrics CASCADE;");
        await sequelize.query("DROP TABLE IF EXISTS inventory_metrics CASCADE;");
        await sequelize.query("DROP TABLE IF EXISTS analytics_events CASCADE;");

        // Sync models (Recreates tables with proper Composite PKs)
        await sequelize.sync({ force: true });
        console.log("✅ Database models synchronized (Tables recreated)");

        // 1. Ensure Extension
        await sequelize.query("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;");
        console.log("✅ TimescaleDB extension confirmed");

        // 2. Convert to Hypertables (Now safe because PK includes time)
        try {
            await sequelize.query("SELECT create_hypertable('analytics_events', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
            console.log("✅ Hypertable 'analytics_events' created");
        } catch (err) { console.warn("Notice:", err.message); }

        try {
            await sequelize.query("SELECT create_hypertable('sales_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
            console.log("✅ Hypertable 'sales_metrics' created");
        } catch (err) { console.warn("Notice:", err.message); }

        try {
            await sequelize.query("SELECT create_hypertable('inventory_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
            console.log("✅ Hypertable 'inventory_metrics' created");
        } catch (err) { console.warn("Notice:", err.message); }

        // 3. Create Continuous Aggregate
        console.log("🔄 Creating sales_daily_summary...");
        await sequelize.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS sales_daily_summary
            WITH (timescaledb.continuous) AS
            SELECT 
                time_bucket('1 day', time) AS bucket,
                "companyId",
                "shopId",
                SUM(amount) as total_revenue,
                SUM("itemCount") as total_items,
                COUNT(*) as total_orders
            FROM sales_metrics
            GROUP BY bucket, "companyId", "shopId"
            WITH NO DATA;
        `);
        console.log("✅ Continuous Aggregate 'sales_daily_summary' created");

        // 4. Add Policy
        try {
            await sequelize.query(`
                SELECT add_continuous_aggregate_policy('sales_daily_summary',
                    start_offset => INTERVAL '1 month',
                    end_offset => INTERVAL '1 hour',
                    schedule_interval => INTERVAL '1 hour');
            `);
            console.log("✅ Policy added");
        } catch (err) { console.warn("Notice:", err.message); }

        console.log("🎉 Database Schema Reset Complete");
        process.exit(0);
    } catch (error) {
        console.error("❌ Fatal Error:", error);
        process.exit(1);
    }
};

resetDatabase();
