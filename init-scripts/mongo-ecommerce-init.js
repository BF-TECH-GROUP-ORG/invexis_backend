db = db.getSiblingDB("ecommercedb");
db.createUser({
  user: "invexis",
  pwd: "invexispass",
  roles: [
    { role: "readWrite", db: "ecommercedb" },
    { role: "dbAdmin", db: "ecommercedb" },
  ],
});
print("Ecommerce service user created successfully");
