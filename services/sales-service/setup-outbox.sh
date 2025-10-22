#!/bin/bash

# Sales Service - Outbox Pattern Setup Script
# This script sets up the event_outbox table for the sales service

echo "🔧 Sales Service - Outbox Pattern Setup"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database configuration
DB_HOST=${DB_HOST:-"sales-mysql"}
DB_PORT=${DB_PORT:-"3306"}
DB_NAME=${DB_NAME:-"salesdb"}
DB_USER=${DB_USER:-"invexis"}
DB_PASS=${DB_PASS:-"invexispass"}

echo "📋 Configuration:"
echo "  Database Host: $DB_HOST"
echo "  Database Port: $DB_PORT"
echo "  Database Name: $DB_NAME"
echo "  Database User: $DB_USER"
echo ""

# Check if MySQL is accessible
echo "🔍 Checking MySQL connection..."
if command -v mysql &> /dev/null; then
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -e "SELECT 1;" &> /dev/null; then
        echo -e "${GREEN}✅ MySQL connection successful${NC}"
    else
        echo -e "${RED}❌ Cannot connect to MySQL${NC}"
        echo "Please check your database credentials"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  MySQL client not found, trying with Docker...${NC}"
fi

# Create database if it doesn't exist
echo ""
echo "📦 Creating database if not exists..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database ready${NC}"
else
    echo -e "${RED}❌ Failed to create database${NC}"
    exit 1
fi

# Run migration
echo ""
echo "🚀 Running migration..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < migrations/create_event_outbox_table.sql 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration completed successfully${NC}"
else
    echo -e "${RED}❌ Migration failed${NC}"
    exit 1
fi

# Verify table creation
echo ""
echo "🔍 Verifying table creation..."
TABLE_EXISTS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SHOW TABLES LIKE 'event_outbox';" 2>/dev/null | grep event_outbox)
if [ -n "$TABLE_EXISTS" ]; then
    echo -e "${GREEN}✅ Table 'event_outbox' created successfully${NC}"
else
    echo -e "${RED}❌ Table 'event_outbox' not found${NC}"
    exit 1
fi

# Show table structure
echo ""
echo "📊 Table structure:"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "DESC event_outbox;" 2>/dev/null

# Show indexes
echo ""
echo "🔑 Indexes:"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SHOW INDEXES FROM event_outbox;" 2>/dev/null

echo ""
echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo ""
echo "📋 Next steps:"
echo "  1. Start the sales service: npm start"
echo "  2. Test sale creation: curl -X POST http://localhost:8005/sales ..."
echo "  3. Check outbox: SELECT * FROM event_outbox;"
echo "  4. Monitor logs: docker logs sales-service -f"
echo ""

