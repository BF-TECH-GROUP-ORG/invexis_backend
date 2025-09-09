db = db.getSiblingDB("authdb");
db.createUser({
  user: "invexis",
  pwd: "invexispass",
  roles: [
    { role: "readWrite", db: "authdb" },
    { role: "dbAdmin", db: "authdb" },
  ],
});
print("Auth service user created successfully");
