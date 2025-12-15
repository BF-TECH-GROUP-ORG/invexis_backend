#!/bin/bash
# Debt Service API Testing Script
# Quick test commands for the debt service endpoints

# Configuration
BASE_URL="http://localhost:8005"
COMPANY_ID="507f1f77bcf86cd799439011"
SHOP_ID="507f1f77bcf86cd799439012"
CUSTOMER_ID="507f1f77bcf86cd799439013"

echo "=== Debt Service API Test Suite ==="
echo ""

# 1. Create a new debt
echo "1. Creating a new debt..."
DEBT_RESPONSE=$(curl -X POST "$BASE_URL/debt/create" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "'$COMPANY_ID'",
    "shopId": "'$SHOP_ID'",
    "customerId": "'$CUSTOMER_ID'",
    "customer": {
      "id": "'$CUSTOMER_ID'",
      "name": "John Doe",
      "phone": "+256701234567"
    },
    "salesId": "507f1f77bcf86cd799439014",
    "salesStaffId": "507f1f77bcf86cd799439015",
    "createdBy": {
      "id": "507f1f77bcf86cd799439016",
      "name": "Admin User"
    },
    "items": [
      {
        "itemId": "507f1f77bcf86cd799439017",
        "itemName": "Sugar - 50kg",
        "quantity": 2,
        "unitPrice": 45000,
        "totalPrice": 90000
      },
      {
        "itemId": "507f1f77bcf86cd799439018",
        "itemName": "Flour - 25kg",
        "quantity": 1,
        "unitPrice": 35000,
        "totalPrice": 35000
      }
    ],
    "totalAmount": 125000,
    "amountPaidNow": 0,
    "dueDate": "2025-12-25T23:59:59Z",
    "shareLevel": "PARTIAL"
  }')

echo "Response:"
echo "$DEBT_RESPONSE" | jq '.'
DEBT_ID=$(echo "$DEBT_RESPONSE" | jq -r '._id // ._id')
echo "Created Debt ID: $DEBT_ID"
echo ""

# 2. Get the created debt (without repayments initially)
echo "2. Retrieving the created debt..."
curl -X GET "$BASE_URL/$COMPANY_ID/debt/$DEBT_ID" \
  -H "Content-Type: application/json" | jq '.'
echo ""

# 3. Record a repayment
echo "3. Recording a repayment..."
REPAYMENT_RESPONSE=$(curl -X POST "$BASE_URL/debt/repayment" \
  -H "Content-Type: application/json" \
  -d '{
    "debtId": "'$DEBT_ID'",
    "companyId": "'$COMPANY_ID'",
    "shopId": "'$SHOP_ID'",
    "customerId": "'$CUSTOMER_ID'",
    "amountPaid": 50000,
    "paymentMethod": "CASH",
    "paymentReference": "REF-001",
    "paymentId": "PAY-001",
    "createdBy": {
      "id": "507f1f77bcf86cd799439021",
      "name": "Cashier John"
    }
  }')

echo "Response:"
echo "$REPAYMENT_RESPONSE" | jq '.'
echo ""

# 4. Get debt with payment history
echo "4. Getting debt with full payment history..."
curl -X GET "$BASE_URL/$COMPANY_ID/debt/$DEBT_ID" \
  -H "Content-Type: application/json" | jq '.'
echo ""

# 5. Record another partial repayment
echo "5. Recording second repayment..."
curl -X POST "$BASE_URL/debt/repayment" \
  -H "Content-Type: application/json" \
  -d '{
    "debtId": "'$DEBT_ID'",
    "companyId": "'$COMPANY_ID'",
    "shopId": "'$SHOP_ID'",
    "customerId": "'$CUSTOMER_ID'",
    "amountPaid": 75000,
    "paymentMethod": "MOBILE_MONEY",
    "paymentReference": "MM-001",
    "paymentId": "PAY-002",
    "createdBy": {
      "id": "507f1f77bcf86cd799439021",
      "name": "Cashier John"
    }
  }' | jq '.'
echo ""

# 6. Get final debt state with all repayments
echo "6. Getting final debt state with payment history..."
curl -X GET "$BASE_URL/$COMPANY_ID/debt/$DEBT_ID" \
  -H "Content-Type: application/json" | jq '.debt | {
    debtId: ._id,
    status: .status,
    totalAmount: .totalAmount,
    totalPaid: .amountPaidNow,
    balance: .balance,
    customer: .customer,
    items: .items,
    repaymentCount: (.repayments | length),
    paymentSummary: .paymentSummary
  }'
echo ""

# 7. List company debts
echo "7. Listing all company debts..."
curl -X GET "$BASE_URL/company/$COMPANY_ID/debts?status=PARTIALLY_PAID&limit=10" \
  -H "Content-Type: application/json" | jq '.items[] | {
    id: ._id,
    customer: .customer.name,
    totalAmount: .totalAmount,
    balance: .balance,
    status: .status
  }'
echo ""

# 8. Get company analytics
echo "8. Getting company analytics..."
curl -X GET "$BASE_URL/analytics/company/$COMPANY_ID" \
  -H "Content-Type: application/json" | jq '.'
echo ""

# 9. Get aging analysis
echo "9. Getting debt aging analysis..."
curl -X GET "$BASE_URL/analytics/company/$COMPANY_ID/aging" \
  -H "Content-Type: application/json" | jq '.'
echo ""

echo "=== Test Suite Complete ==="
