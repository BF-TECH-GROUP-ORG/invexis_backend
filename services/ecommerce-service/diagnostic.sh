#!/bin/bash

# E-Commerce Service Diagnostic Script
# Helps debug empty products array issue

API_URL="${1:-https://granitic-jule-haunting.ngrok-free.dev/api/ecommerce}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "================================"
echo "E-Commerce Service Diagnostics"
echo "================================"
echo "Timestamp: $TIMESTAMP"
echo "API URL: $API_URL"
echo ""

# Test 1: Health Check
echo "📋 TEST 1: Health Check"
echo "GET /ecommerce"
curl -s "$API_URL" | jq '.' || echo "❌ Failed"
echo ""

# Test 2: Get Products
echo "📋 TEST 2: List Products (without filters)"
echo "GET /ecommerce/products"
curl -s "$API_URL/products" | jq '.' || echo "❌ Failed"
echo ""

# Test 3: Get Products with limit
echo "📋 TEST 3: List Products (with pagination)"
echo "GET /ecommerce/products?page=1&limit=50"
curl -s "$API_URL/products?page=1&limit=50" | jq '.' || echo "❌ Failed"
echo ""

# Test 4: Debug Status
echo "📋 TEST 4: Debug Status (Database & Cache)"
echo "GET /ecommerce/products/debug/status"
curl -s "$API_URL/products/debug/status" | jq '.' || echo "❌ Failed"
echo ""

echo "================================"
echo "Diagnostic Complete"
echo "================================"
