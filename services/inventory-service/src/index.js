const connectDB = require("./config/db");
const { connectRabbitMQ } = require("./events/reportEvents");
const { scheduleDailyReport } = require("./services/reportService");
const logger = require("./utils/logger");

const startServer = async () => {
  try {
    await connectDB();
    await connectRabbitMQ();
    await scheduleDailyReport();
    require("./app"); // Start Express server
  } catch (error) {
    console.log("Failed to start server:", error);
  }
};

startServer();
