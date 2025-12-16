#!/bin/bash

# Debt Service Seed Verification Script
# This script verifies that the seed controller properly saves data to MongoDB

set -e

echo "🔍 Debt Service Seed Verification"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8005"
DEBT_API="$BASE_URL/debt"

# Step 1: Check if service is running
echo -e "${BLUE}Step 1: Checking if debt-service is running...${NC}"
if ! curl -s "$DEBT_API/" > /dev/null 2>&1; then
    echo -e "${RED}❌ Service not running on $BASE_URL${NC}"
    echo "Please start the service with: npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Service is running${NC}"
echo ""

# Step 2: Run the seed
echo -e "${BLUE}Step 2: Running seed...${NC}"
SEED_RESPONSE=$(curl -s -X POST "$DEBT_API/seed" \
  -H "Content-Type: application/json")

# Check if seed was successful
if echo "$SEED_RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Seed executed successfully${NC}"
    
    # Extract IDs
    COMPANY_ID=$(echo "$SEED_RESPONSE" | jq -r '.data.companyId')
    CUSTOMER_ID=$(echo "$SEED_RESPONSE" | jq -r '.data.customerId')
    DEBT_IDS=$(echo "$SEED_RESPONSE" | jq -r '.data.debts[]')
    
    echo "  Company ID: $COMPANY_ID"
    echo "  Customer ID: $CUSTOMER_ID"
    echo "  Debt IDs: $DEBT_IDS"
else
    echo -e "${RED}❌ Seed failed${NC}"
    echo "Response:"
    echo "$SEED_RESPONSE" | jq '.'
    exit 1
fi
echo ""

# Step 3: Verify debts were created
echo -e "${BLUE}Step 3: Verifying debts in database...${NC}"
ALL_DEBTS=$(curl -s "$DEBT_API/all")

DEBT_COUNT=$(echo "$ALL_DEBTS" | jq 'length')
if [ "$DEBT_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✓ Found $DEBT_COUNT debts in database${NC}"
else
    echo -e "${RED}❌ Expected at least 2 debts, but found $DEBT_COUNT${NC}"
    exit 1
fi
echo ""

# Step 4: Verify company summary
echo -e "${BLUE}Step 4: Verifying company summary...${NC}"
COMPANY_SUMMARY=$(curl -s "$DEBT_API/summary/company/$COMPANY_ID")

if echo "$COMPANY_SUMMARY" | jq -e '.companyId' >/dev/null 2>&1; then
    OUTSTANDING=$(echo "$COMPANY_SUMMARY" | jq '.totalOutstanding')
    echo -e "${GREEN}✓ Company summary exists${NC}"
    echo "  Total Outstanding: $OUTSTANDING"
else
    echo -e "${RED}❌ Company summary not found${NC}"
    exit 1
fi
echo ""

# Step 5: Verify customer debts
echo -e "${BLUE}Step 5: Verifying customer debts...${NC}"
CUSTOMER_DEBTS=$(curl -s "$DEBT_API/customer/$CUSTOMER_ID/debts")

CUSTOMER_DEBT_COUNT=$(echo "$CUSTOMER_DEBTS" | jq 'length')
if [ "$CUSTOMER_DEBT_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✓ Found $CUSTOMER_DEBT_COUNT customer debts${NC}"
else
    echo -e "${RED}❌ Expected at least 2 customer debts, but found $CUSTOMER_DEBT_COUNT${NC}"
    exit 1
fi
echo ""

# Final Summary
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ ALL VERIFICATION CHECKS PASSED!${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""
echo "Summary:"
echo "  • Seed executed successfully"
echo "  • $DEBT_COUNT debts saved to database"
echo "  • Company summary created"
echo "  • $CUSTOMER_DEBT_COUNT customer debts linked"
echo ""
echo "Next steps:"
echo "  1. Check logs for any ⚠️ warnings"
echo "  2. Test event publishing (if configured)"
echo "  3. Run integration tests"
echo ""
