#!/bin/bash

# Debt Service Seed Testing Script
# This script provides quick commands to seed and verify the debt-service

BASE_URL="http://localhost:8005"
DEBT_SERVICE="$BASE_URL/debt"

echo "🌱 Debt Service Seeding Helper"
echo "=============================="
echo ""
echo "Make sure the debt-service is running on port 8005"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run seed
seed() {
    echo -e "${BLUE}🌱 Running seed...${NC}"
    RESPONSE=$(curl -s -X POST "$DEBT_SERVICE/seed" \
      -H "Content-Type: application/json")
    
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    
    if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Seed completed successfully${NC}"
        
        # Extract IDs for later use
        COMPANY_ID=$(echo "$RESPONSE" | jq -r '.data.companyId')
        CUSTOMER_ID=$(echo "$RESPONSE" | jq -r '.data.customerId')
        HASHED_ID=$(echo "$RESPONSE" | jq -r '.data.hashedCustomerId')
        
        echo -e "\n${YELLOW}Saved IDs for testing:${NC}"
        echo "COMPANY_ID=$COMPANY_ID" > .seed-test.env
        echo "CUSTOMER_ID=$CUSTOMER_ID" >> .seed-test.env
        echo "HASHED_ID=$HASHED_ID" >> .seed-test.env
        
        echo "  Company ID: $COMPANY_ID"
        echo "  Customer ID: $CUSTOMER_ID"
        echo "  Hashed Customer ID: $HASHED_ID"
    else
        echo -e "${YELLOW}❌ Seed failed${NC}"
        echo "$RESPONSE" | jq '.error' 2>/dev/null
    fi
}

# Function to get all debts
get_all_debts() {
    echo -e "${BLUE}📋 Fetching all debts...${NC}"
    curl -s "$DEBT_SERVICE/all" | jq '.'
}

# Function to get company summary
get_company_summary() {
    if [ -z "$1" ]; then
        echo "Usage: $0 company-summary <companyId>"
        return
    fi
    echo -e "${BLUE}📊 Fetching company summary for $1...${NC}"
    curl -s "$DEBT_SERVICE/summary/company/$1" | jq '.'
}

# Function to get customer debts
get_customer_debts() {
    if [ -z "$1" ]; then
        echo "Usage: $0 customer-debts <customerId>"
        return
    fi
    echo -e "${BLUE}👤 Fetching debts for customer $1...${NC}"
    curl -s "$DEBT_SERVICE/customer/$1/debts" | jq '.'
}

# Function to get cross-company summary
get_cross_company_summary() {
    if [ -z "$1" ]; then
        echo "Usage: $0 cross-company <hashedCustomerId>"
        return
    fi
    echo -e "${BLUE}🌍 Fetching cross-company summary for $1...${NC}"
    curl -s "$DEBT_SERVICE/summary/cross-company/$1" | jq '.'
}

# Function to show quick test menu
show_menu() {
    echo ""
    echo -e "${YELLOW}Available Commands:${NC}"
    echo ""
    echo "  $0 seed                          - Run the seed"
    echo "  $0 all-debts                     - Get all debts"
    echo "  $0 company-summary <id>          - Get company summary"
    echo "  $0 customer-debts <id>           - Get customer debts"
    echo "  $0 cross-company <hashed-id>     - Get cross-company summary"
    echo "  $0 quick-test                    - Run full test sequence"
    echo "  $0 help                          - Show this menu"
    echo ""
}

# Function to run quick test
quick_test() {
    echo -e "${YELLOW}🔧 Running full test sequence...${NC}"
    echo ""
    
    seed
    echo ""
    
    # Load IDs from env file if it exists
    if [ -f .seed-test.env ]; then
        source .seed-test.env
        
        echo ""
        get_all_debts
        
        echo ""
        get_company_summary "$COMPANY_ID"
        
        echo ""
        get_customer_debts "$CUSTOMER_ID"
        
        echo ""
        get_cross_company_summary "$HASHED_ID"
    fi
}

# Main command handler
case "${1:-help}" in
    seed)
        seed
        ;;
    all-debts)
        get_all_debts
        ;;
    company-summary)
        get_company_summary "$2"
        ;;
    customer-debts)
        get_customer_debts "$2"
        ;;
    cross-company)
        get_cross_company_summary "$2"
        ;;
    quick-test)
        quick_test
        ;;
    help)
        show_menu
        ;;
    *)
        echo -e "${YELLOW}Unknown command: $1${NC}"
        show_menu
        ;;
esac
