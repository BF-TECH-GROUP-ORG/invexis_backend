#!/usr/bin/env bash
set -euo pipefail

# Change this if you want different password(s)
PASSWORD="invexispass"

# mapping: container db user
declare -a MAPPINGS=(
  "invexis-auth-mongodb authdb invexis"
  "invexis-inventory-mongodb inventorydb invexis"
  "invexis-ecommerce-mongodb ecommercedb invexis"
  "invexis-analytics-mongodb analytics_mongodb invexis"
  "invexis-audit-mongodb auditdb invexis"
  "invexis-debt-mongodb debtdb invexis"
)

echo "[info] Creating MongoDB users (idempotent). Containers must be running."
for entry in "${MAPPINGS[@]}"; do
  container=$(awk '{print $1}' <<<"$entry")
  dbname=$(awk '{print $2}' <<<"$entry")
  username=$(awk '{print $3}' <<<"$entry")

  echo "--------------------------------------------------------------------------------"
  echo "[info] Processing container: $container  db: $dbname  user: $username"

  # JS that checks user existence and creates if missing (idempotent).
  read -r -d '' JS <<'JSCODE' || true
var targetDB = db.getSiblingDB("%DB%");
var existing = targetDB.getUser("%USER%");
if (existing) {
  print("SKIP: user %USER% already exists on %DB%");
} else {
  targetDB.createUser({
    user: "%USER%",
    pwd: "%PWD%",
    roles: [{ role: "readWrite", db: "%DB%" }]
  });
  print("CREATED: user %USER% on %DB%");
}
JSCODE

  # inject values
  JS="${JS//%DB%/$dbname}"
  JS="${JS//%USER%/$username}"
  JS="${JS//%PWD%/$PASSWORD}"

  # Execute inside the container as root (admin auth)
  docker exec -i "$container" \
    mongosh -u root -p "$PASSWORD" --authenticationDatabase admin --eval "$JS" \
    || { echo "[error] Failed to create user $username on $container"; exit 1; }

done

echo "--------------------------------------------------------------------------------"
echo "[done] All user creation attempts finished."
echo
echo "Run the verification step next (see instructions)."
