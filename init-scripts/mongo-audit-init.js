
db = db.getSiblingDB("auditdb");
db.createUser({
  user: "invexis",
  pwd: "invexispass",
  roles: [
    { role: "readWrite", db: "auditdb" },
    { role: "dbAdmin", db: "auditdb" },
  ],
});
print("Audit service user created successfully");
