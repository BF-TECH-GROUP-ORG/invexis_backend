const shops = [];

exports.createShop = (req, res) => {
  const shop = { id: shops.length + 1, ...req.body };
  shops.push(shop);
  res.status(201).json(shop);
};

exports.getShops = (req, res) => {
  res.json(shops);
};

exports.getShopById = (req, res) => {
  const shop = shops.find(s => s.id === parseInt(req.params.id));
  if (!shop) return res.status(404).json({ message: "Shop not found" });
  res.json(shop);
};

exports.updateShop = (req, res) => {
  const shop = shops.find(s => s.id === parseInt(req.params.id));
  if (!shop) return res.status(404).json({ message: "Shop not found" });
  Object.assign(shop, req.body);
  res.json(shop);
};

exports.deleteShop = (req, res) => {
  const index = shops.findIndex(s => s.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ message: "Shop not found" });
  shops.splice(index, 1);
  res.json({ message: "Shop deleted" });
};