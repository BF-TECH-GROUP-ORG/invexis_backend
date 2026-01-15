const { app, initialize } = require("./app");
const PORT = process.env.PORT || 9000;

app.listen(PORT, () => {
  initialize();
  console.log(`🚀 Sales Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Sales endpoint: http://localhost:${PORT}/sales`);
});
