db = db.getSiblingDB("analytics_mongodb");
db.createUser({
  user: "invexis",
  pwd: "invexispass",
  roles: [
    { role: "readWrite", db: "analytics_mongodb" },
    { role: "dbAdmin", db: "analytics_mongodb" },
  ],
});
print("Analytics service user created successfully");
