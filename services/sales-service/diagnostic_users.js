const { KnownUser } = require("./src/models/index.model");
const sequelize = require("./src/config/db");

async function diagnostic() {
    try {
        await sequelize.authenticate();
        console.log("Database connected.");

        const count = await KnownUser.count();
        console.log("Total KnownUsers:", count);

        const users = await KnownUser.findAll({ limit: 5 });
        console.log("First 5 Users:", JSON.stringify(users, null, 2));

    } catch (error) {
        console.error("Diagnostic failed:", error);
    } finally {
        process.exit();
    }
}

diagnostic();
