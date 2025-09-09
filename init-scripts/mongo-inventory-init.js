db = db.getSiblingDB("inventorydb");
db.createUser({
  user: "invexis",
  pwd: "invexispass",
  roles: [
    { role: "readWrite", db: "inventorydb" },
    { role: "dbAdmin", db: "inventorydb" },
  ],
});
print("Inventory service user created successfully");
