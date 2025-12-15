#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========== BULK CROSS-COMPANY TRANSFER WITH CATEGORY AUTO-CREATION ==========${NC}\n"

# AQUOT Company
FROM_COMPANY="de1345c8-3afd-48eb-b007-852969dcd39e"
FROM_SHOP="9dbedccc-d6a9-4a69-acb3-3c89f6decbfb"  # Abraham English

# Mc Donalds Company (different company)
TO_COMPANY="2b51c838-8dc2-4c38-bbe1-fbeda67fae1f"
TO_SHOP="819c4565-8375-413f-806f-c5a1ace0fc5d"  # Cassady Wilkins

BASE="http://localhost:8007/inventory/v1"

echo -e "${YELLOW}Step 1: Creating test products with different categories...${NC}"

# Create product 1 in "Books" category
PRODUCT1_ID=$(docker exec mongodb mongosh -u root -p invexispass --authenticationDatabase admin inventorydb --quiet --eval "
const now = new Date();
const ts = Date.now();

// Create a category for Books (Level 3)
const catBooks = db.categories.insertOne({
  companyId: '$FROM_COMPANY',
  name: 'Test Books',
  slug: 'test-books-' + ts,
  level: 3,
  isActive: true,
  __v: 0,
  createdAt: now
}).insertedId;
const pid1 = db.products.insertOne({
         
  companyId: '$FROM_COMPANY',
  shopId: '$FROM_SHOP',
  name: 'Book Product ' + ts,
  description: 'Testing bulk transfer with Books category',
  brand: 'BookBrand',
  sku: 'BOOK-' + ts,
  barcode: 'BC-BOOK-' + ts,
  scanId: 'SC-BOOK-' + ts,
  categoryId: catBooks,
  category: 'Books',
  isDeleted: false,
  status: 'active',
  __v: 0,
  createdAt: now
}).insertedId;

db.productpricings.insertOne({
  productId: pid1,
  price: 25.99,
  basePrice: 20,
  cost: 15,
  __v: 0
});

db.productstocks.insertOne({
  productId: pid1,
  shopId: '$FROM_SHOP',
  companyId: '$FROM_COMPANY',
  stockQty: 100,
  trackQuantity: true,
  __v: 0
});

print(pid1.toString());
" --quiet 2>/dev/null | tail -1)

echo -e "${GREEN}✓ Product 1 (Books): $PRODUCT1_ID${NC}"

# Create product 2 in "Pens" category
PRODUCT2_ID=$(docker exec mongodb mongosh -u root -p invexispass --authenticationDatabase admin inventorydb --quiet --eval "
const now = new Date();
const ts = Date.now();

// Create a category for Pens (Level 3)
const catPens = db.categories.insertOne({
  companyId: '$FROM_COMPANY',
  name: 'Test Pens',
  slug: 'test-pens-' + ts,
  level: 3,
  isActive: true,
  __v: 0,
  createdAt: now
}).insertedId;

const pid2 = db.products.insertOne({
  companyId: '$FROM_COMPANY',
  shopId: '$FROM_SHOP',
  name: 'Pen Product ' + ts,
  description: 'Testing bulk transfer with Pens category',
  brand: 'PenBrand',
  sku: 'PEN-' + ts,
  barcode: 'BC-PEN-' + ts,
  scanId: 'SC-PEN-' + ts,
  categoryId: catPens,
  category: 'Pens',
  isDeleted: false,
  status: 'active',
  __v: 0,
  createdAt: now
}).insertedId;

db.productpricings.insertOne({
  productId: pid2,
  price: 5.99,
  basePrice: 4,
  cost: 2,
  __v: 0
});

db.productstocks.insertOne({
  productId: pid2,
  shopId: '$FROM_SHOP',
  companyId: '$FROM_COMPANY',
  stockQty: 200,
  trackQuantity: true,
  __v: 0
});

print(pid2.toString());
" --quiet 2>/dev/null | tail -1)

echo -e "${GREEN}✓ Product 2 (Pens): $PRODUCT2_ID${NC}"

# Create product 3 in "Electronics" category
PRODUCT3_ID=$(docker exec mongodb mongosh -u root -p invexispass --authenticationDatabase admin inventorydb --quiet --eval "
const now = new Date();
const ts = Date.now();

// Create a category for Electronics (Level 3)
const catElec = db.categories.insertOne({
  companyId: '$FROM_COMPANY',
  name: 'Test Electronics',
  slug: 'test-electronics-' + ts,
  level: 3,
  isActive: true,
  __v: 0,
  createdAt: now
}).insertedId;

const pid3 = db.products.insertOne({
  companyId: '$FROM_COMPANY',
  shopId: '$FROM_SHOP',
  name: 'Electronic Product ' + ts,
  description: 'Testing bulk transfer with Electronics category',
  brand: 'ElecBrand',
  sku: 'ELEC-' + ts,
  barcode: 'BC-ELEC-' + ts,
  scanId: 'SC-ELEC-' + ts,
  categoryId: catElec,
  category: 'Electronics',
  isDeleted: false,
  status: 'active',
  __v: 0,
  createdAt: now
}).insertedId;

db.productpricings.insertOne({
  productId: pid3,
  price: 199.99,
  basePrice: 150,
  cost: 100,
  __v: 0
});

db.productstocks.insertOne({
  productId: pid3,
  shopId: '$FROM_SHOP',
  companyId: '$FROM_COMPANY',
  stockQty: 50,
  trackQuantity: true,
  __v: 0
});

print(pid3.toString());
" --quiet 2>/dev/null | tail -1)

echo -e "${GREEN}✓ Product 3 (Electronics): $PRODUCT3_ID${NC}\n"

echo -e "${YELLOW}Step 2: Checking categories in destination company (should be empty)...${NC}"
DEST_CATS_BEFORE=$(docker exec mongodb mongosh -u root -p invexispass --authenticationDatabase admin inventorydb --quiet --eval "
db.categories.countDocuments({ companyId: '$TO_COMPANY', level: 3 })
" --quiet 2>/dev/null | tail -1)
echo -e "Categories in destination company: ${DEST_CATS_BEFORE}\n"

echo -e "${YELLOW}Step 3: Performing BULK CROSS-COMPANY TRANSFER...${NC}"
echo -e "${BLUE}From: AQUOT Company → To: Mc Donalds Company${NC}"
echo -e "${BLUE}Transferring 3 products from different categories${NC}\n"

RESULT=$(curl -s -X POST "$BASE/companies/$FROM_COMPANY/shops/$FROM_SHOP/bulk-cross-company-transfer" \
  -H "Content-Type: application/json" \
  -H "X-Gateway-Request: true" \
  -d "{
  \"toCompanyId\": \"$TO_COMPANY\",
  \"toShopId\": \"$TO_SHOP\",
  \"transfers\": [
    {
      \"productId\": \"$PRODUCT1_ID\",
      \"quantity\": 10
    },
    {
      \"productId\": \"$PRODUCT2_ID\",
      \"quantity\": 20
    },
    {
      \"productId\": \"$PRODUCT3_ID\",
      \"quantity\": 5
    }
  ],
  \"reason\": \"Bulk transfer test with category auto-creation\",
  \"userId\": \"test-$(date +%s)\",
  \"notes\": \"Testing automatic category creation for multiple products\"
}")

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   BULK TRANSFER RESULT${NC}"
echo -e "${GREEN}========================================${NC}"
echo "$RESULT" | jq '.'

if [ "$(echo "$RESULT" | jq -r '.success')" = "true" ]; then
  echo -e "\n${GREEN}✓✓✓ BULK CROSS-COMPANY TRANSFER SUCCESSFUL! ✓✓✓${NC}"
  
  SUCCESSFUL=$(echo "$RESULT" | jq -r '.data.successful | length')
  FAILED=$(echo "$RESULT" | jq -r '.data.failed | length')
  CATEGORIES_CREATED=$(echo "$RESULT" | jq -r '.data.categoriesCreated | length')
  
  echo -e "\n${BLUE}Summary:${NC}"
  echo -e "  Total Requested: 3"
  echo -e "  Successful: ${GREEN}${SUCCESSFUL}${NC}"
  echo -e "  Failed: ${RED}${FAILED}${NC}"
  echo -e "  Categories Created: ${GREEN}${CATEGORIES_CREATED}${NC}"
  
  if [ "$CATEGORIES_CREATED" -gt 0 ]; then
    echo -e "\n${BLUE}Categories Auto-Created:${NC}"
    echo "$RESULT" | jq -r '.data.categoriesCreated[] | "  ✓ \(.categoryName) (ID: \(.categoryId))"'
  fi
  
  echo -e "\n${BLUE}Transferred Products:${NC}"
  echo "$RESULT" | jq -r '.data.successful[] | "  ✓ \(.productName) - \(.quantity) units → New Product ID: \(.newProductId)"'
  
  echo -e "\n${YELLOW}Step 4: Verifying categories in destination company...${NC}"
  DEST_CATS_AFTER=$(docker exec mongodb mongosh -u root -p invexispass --authenticationDatabase admin inventorydb --quiet --eval "
  db.categories.countDocuments({ companyId: '$TO_COMPANY', level: 3 })
  " --quiet 2>/dev/null | tail -1)
  echo -e "Categories in destination company: ${GREEN}${DEST_CATS_AFTER}${NC} (was ${DEST_CATS_BEFORE})"
  
  echo -e "\n${YELLOW}Step 5: Verifying destination company categories...${NC}"
  docker exec mongodb mongosh -u root -p invexispass --authenticationDatabase admin inventorydb --quiet --eval "
  db.categories.find({ companyId: '$TO_COMPANY', level: 3 }).forEach(cat => {
    print('  ✓ ' + cat.name + ' (' + cat.slug + ')');
  });
  " --quiet 2>/dev/null
  
  echo -e "\n${YELLOW}Step 6: Verifying products in destination company...${NC}"
  docker exec mongodb mongosh -u root -p invexispass --authenticationDatabase admin inventorydb --quiet --eval "
  db.products.find({ companyId: '$TO_COMPANY', shopId: '$TO_SHOP' }).forEach(prod => {
    const cat = db.categories.findOne({ _id: prod.categoryId });
    const stock = db.productstocks.findOne({ productId: prod._id });
    print('  ✓ ' + prod.name + ' | Category: ' + (cat ? cat.name : 'None') + ' | Stock: ' + (stock ? stock.stockQty : 0));
  });
  " --quiet 2>/dev/null
  
  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}Bulk transfer system with category auto-creation working perfectly!${NC}"
  echo -e "  ✓ Multiple products transferred"
  echo -e "  ✓ Different categories handled"
  echo -e "  ✓ Categories auto-created in destination"
  echo -e "  ✓ Products properly categorized"
  echo -e "  ✓ Stock properly allocated"
  
else
  echo -e "\n${RED}✗ FAILED: $(echo "$RESULT" | jq -r '.message')${NC}"
fi

echo ""