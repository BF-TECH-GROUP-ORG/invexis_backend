db = db.getSiblingDB("debtdb");
db.createUser({
  user: "invexis",
  pwd: "invexispass",
  roles: [
    { role: "readWrite", db: "debtdb" },
    { role: "dbAdmin", db: "debtdb" },
  ],
});
print("Debt service user created successfully");
