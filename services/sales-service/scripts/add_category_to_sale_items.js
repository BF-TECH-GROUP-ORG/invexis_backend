const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sequelize = require("../src/config/db");

const migrate = async () => {
    try {
        await sequelize.authenticate();
        console.log("✅ Database connection established");

        console.log("🔄 Adding 'category' column to 'sale_items'...");
        try {
            await sequelize.query("ALTER TABLE sale_items ADD COLUMN category VARCHAR(255) DEFAULT 'Uncategorized';");
            console.log("✅ Column 'category' added successfully.");
        } catch (error) {
            if (error.original && error.original.code === 'ER_DUP_FIELDNAME') {
                console.log("ℹ️ Column 'category' already exists.");
            } else {
                console.warn("⚠️ Warning adding category:", error.message);
            }
        }

        console.log("🔄 Adding 'costPrice' column to 'sale_items'...");
        try {
            await sequelize.query("ALTER TABLE sale_items ADD COLUMN costPrice DECIMAL(12, 2) DEFAULT 0;");
            console.log("✅ Column 'costPrice' added successfully.");
        } catch (error) {
            if (error.original && error.original.code === 'ER_DUP_FIELDNAME') {
                console.log("ℹ️ Column 'costPrice' already exists.");
            } else {
                console.warn("⚠️ Warning adding costPrice:", error.message);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
};

migrate();
