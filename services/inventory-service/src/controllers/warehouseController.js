// Warehouse endpoints have been removed. Keep stubs to return 410 Gone to clients
// while we ensure references are cleaned up in other services.

const gone = (req, res) => {
  res.status(410).json({ success: false, message: 'Warehouse feature removed' });
};

module.exports = {
  getAllWarehouses: gone,
  getWarehouseById: gone,
  createWarehouse: gone,
  updateWarehouse: gone,
  deleteWarehouse: gone,
};