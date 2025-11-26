#!/bin/bash
# setup-and-test.sh
# Complete setup and testing script for Payment Service

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Invexis Payment Service - Setup & Test Script           ║"
echo "╔════════════════════════════════════════════════════════════╗"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Check if .env exists
echo -e "${BLUE}Step 1: Checking environment configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠ .env file not found. Copying from .env-example...${NC}"
    cp .env-example .env
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}⚠ Please update .env with your credentials before continuing${NC}"
    echo ""
    echo "Required updates:"
    echo "  - Database credentials (if different)"
    echo "  - Gateway API keys (Stripe, MTN, Airtel, M-Pesa)"
    echo ""
    read -p "Press Enter when ready to continue..."
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi
echo ""

# Step 2: Check if node_modules exists
echo -e "${BLUE}Step 2: Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Dependencies not installed. Installing...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi
echo ""

# Step 3: Check database connection
echo -e "${BLUE}Step 3: Checking database connection...${NC}"
if npm run migrate:status > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    echo -e "${YELLOW}Please ensure PostgreSQL is running and credentials are correct${NC}"
    echo ""
    echo "Options:"
    echo "  1. Start PostgreSQL locally"
    echo "  2. Use Docker: docker-compose up -d payment-postgres"
    echo "  3. Update DB_HOST in .env to 'localhost' if not using Docker"
    echo ""
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Step 4: Run migrations
echo -e "${BLUE}Step 4: Running database migrations...${NC}"
if npm run migrate:latest; then
    echo -e "${GREEN}✓ Migrations completed successfully${NC}"
else
    echo -e "${RED}✗ Migrations failed${NC}"
    echo -e "${YELLOW}This is expected if database is not running${NC}"
fi
echo ""

# Step 5: Show migration status
echo -e "${BLUE}Step 5: Checking migration status...${NC}"
npm run migrate:status || echo -e "${YELLOW}⚠ Could not check migration status${NC}"
echo ""

# Step 6: Start service in background
echo -e "${BLUE}Step 6: Starting payment service...${NC}"
echo -e "${YELLOW}Starting service in background...${NC}"
npm run dev > service.log 2>&1 &
SERVICE_PID=$!
echo -e "${GREEN}✓ Service started (PID: $SERVICE_PID)${NC}"
echo -e "${YELLOW}Waiting for service to be ready...${NC}"
sleep 5
echo ""

# Step 7: Run tests
echo -e "${BLUE}Step 7: Running test suite...${NC}"
echo ""
node test-payment.js

# Step 8: Cleanup
echo ""
echo -e "${BLUE}Step 8: Cleanup...${NC}"
echo -e "${YELLOW}Stopping service (PID: $SERVICE_PID)...${NC}"
kill $SERVICE_PID 2>/dev/null || true
echo -e "${GREEN}✓ Service stopped${NC}"
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE                          ║"
echo "╔════════════════════════════════════════════════════════════╗"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Review test results above"
echo "  2. Start service: npm run dev"
echo "  3. Test manually with curl or Postman"
echo "  4. Configure webhooks in gateway dashboards"
echo ""
echo -e "${BLUE}Service will be available at: http://localhost:8009${NC}"
echo -e "${BLUE}Health check: http://localhost:8009/health${NC}"
echo ""
