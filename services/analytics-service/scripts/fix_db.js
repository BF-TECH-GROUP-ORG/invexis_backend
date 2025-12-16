const sequelize = require("../src/config/database");

const fixDatabase = async () => {
    try {
        await sequelize.authenticate();
        console.log("✅ Database connection established");

        // 1. Ensure Extension
        await sequelize.query("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;");
        console.log("✅ TimescaleDB extension confirmed");

        // 2. Converty to Hypertable (if not already)
        try {
            // Use migrate_data => true just in case it was created as standard table by Sequelize
            await sequelize.query("SELECT create_hypertable('sales_metrics', 'time', if_not_exists => TRUE, migrate_data => TRUE);");
            console.log("✅ Hypertable 'sales_metrics' confirmed");
        } catch (err) {
            console.log("ℹ️ Hypertable creation notice:", err.message);
        }

        // 3. Create Continuous Aggregate
        console.log("🔄 Attempting to create sales_daily_summary...");
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
        console.log("✅ Continuous Aggregate 'sales_daily_summary' created/verified");

        // 4. Add Policy
        try {
            await sequelize.query(`
                SELECT add_continuous_aggregate_policy('sales_daily_summary',
                    start_offset => INTERVAL '1 month',
                    end_offset => INTERVAL '1 hour',
                    schedule_interval => INTERVAL '1 hour');
            `);
            console.log("✅ Policy added");
        } catch (err) {
            console.log("ℹ️ Policy notice (likely exists):", err.message);
        }

        console.log("🎉 Database Repair Complete");
        process.exit(0);
    } catch (error) {
        console.error("❌ Fatal Error:", error);
        process.exit(1);
    }
};

fixDatabase();
