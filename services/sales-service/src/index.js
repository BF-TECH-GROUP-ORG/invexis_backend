const app = require("./app");
const PORT = process.env.PORT || 9000;

app.listen(PORT, () => {
  console.log(`🚀 Sales Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 API endpoint: http://localhost:${PORT}/sales`);
});
