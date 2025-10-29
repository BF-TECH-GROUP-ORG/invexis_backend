# 🧪 Testing Guide - Sales Service with Outbox Pattern

## Overview

This guide will help you test the sales service with the transactional outbox pattern implementation.

---

## 📋 Prerequisites

Before testing, ensure you have:

- ✅ Docker and Docker Compose installed
- ✅ MySQL database running (invexis_sales)
- ✅ RabbitMQ running
- ✅ Node.js installed (for local testing)

---

## 🚀 Setup Steps

### Step 1: Start Infrastructure

```bash
# Start all services with Docker Compose
docker-compose up -d

# Verify services are running
docker-compose ps

# Expected services:
# - sales-mysql (MySQL database)
# - rabbitmq (Message broker)
# - sales-service (Sales API)
```

### Step 2: Create Outbox Table

#### Option A: Using the Setup Script

```bash
cd services/sales-service
./setup-outbox.sh

# Follow the prompts
# The script will:
# 1. Check MySQL connection
# 2. Create database if needed
# 3. Run migration
# 4. Verify table creation
```

#### Option B: Manual Migration

```bash
# Connect to MySQL
docker exec -it sales-mysql mysql -u root -p

# Create database
CREATE DATABASE IF NOT EXISTS invexis_sales;
USE invexis_sales;

# Run migration
SOURCE /app/migrations/create_event_outbox_table.sql;

# Verify
SHOW TABLES;
DESC event_outbox;
```

### Step 3: Verify Service is Running

```bash
# Check service logs
docker logs sales-service -f

# Expected output:
# ✅ Database connection established
# ✅ Database models synchronized
# ✅ Event system initialized
# 🚀 Outbox Dispatcher started (interval: 5000ms)
# 🚀 Sales Service running on port 8005
```

### Step 4: Test Health Check

```bash
# Test health endpoint
curl http://localhost:8005/health

# Expected response:
# {
#   "status": "OK",
#   "service": "sales-service",
#   "timestamp": "2024-10-19T..."
# }
```

---

## 🧪 Test Cases

### Test 1: Create a Sale (Basic)

```bash
curl -X POST http://localhost:8005/sales \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": 1,
    "shopId": 1,
    "customerId": 123,
    "saleType": "in_store",
    "subTotal": 100.00,
    "discountTotal": 0,
    "taxTotal": 0,
    "totalAmount": 100.00,
    "paymentMethod": "cash",
    "customerName": "John Doe",
    "customerPhone": "+250788123456"
  }'
```

**Expected Result:**
- ✅ Sale created in database
- ✅ Event added to outbox table
- ✅ HTTP 201 Created response

**Verify in Database:**

```sql
-- Check sale was created
SELECT * FROM sales ORDER BY createdAt DESC LIMIT 1;

-- Check outbox event
SELECT * FROM event_outbox ORDER BY created_at DESC LIMIT 1;

-- Should see:
-- event_type: "sale.created"
-- status: "pending"
```

**Verify Event Published:**

```bash
# Wait 5 seconds for outbox dispatcher
sleep 5

# Check logs
docker logs sales-service --tail 20

# Should see:
# 📤 Published sale.created from outbox → OK
```

**Verify in Database Again:**

```sql
-- Check event status changed to "sent"
SELECT * FROM event_outbox ORDER BY created_at DESC LIMIT 1;

-- Should see:
-- status: "sent"
-- sent_at: <timestamp>
```

---

### Test 2: Create Sale with Items

```bash
curl -X POST http://localhost:8005/sales \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": 1,
    "shopId": 1,
    "customerId": 456,
    "saleType": "ecommerce",
    "subTotal": 250.00,
    "discountTotal": 25.00,
    "taxTotal": 22.50,
    "totalAmount": 247.50,
    "paymentMethod": "card",
    "customerName": "Jane Smith",
    "customerPhone": "+250788987654",
    "items": [
      {
        "productId": 10,
        "quantity": 2,
        "unitPrice": 75.00,
        "discount": 15.00,
        "tax": 13.50,
        "totalPrice": 148.50
      },
      {
        "productId": 20,
        "quantity": 1,
        "unitPrice": 100.00,
        "discount": 10.00,
        "tax": 9.00,
        "totalPrice": 99.00
      }
    ]
  }'
```

**Expected Result:**
- ✅ Sale created
- ✅ 2 sale items created
- ✅ 3 events in outbox:
  - sale.created
  - sale.item.added (product 10)
  - sale.item.added (product 20)

**Verify:**

```sql
-- Check sale
SELECT * FROM sales ORDER BY createdAt DESC LIMIT 1;

-- Check items
SELECT * FROM sales_items WHERE saleId = <sale_id>;

-- Check outbox events
SELECT event_type, status FROM event_outbox 
ORDER BY created_at DESC LIMIT 3;
```

---

### Test 3: Complete a Sale

```bash
# First, create a sale and get the saleId
SALE_ID=1

# Complete the sale
curl -X POST http://localhost:8005/sales/$SALE_ID/complete \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": 789
  }'
```

**Expected Result:**
- ✅ Sale status updated to "completed"
- ✅ Payment status updated to "paid"
- ✅ 2 events in outbox:
  - sale.completed
  - sale.payment.completed

**Verify:**

```sql
-- Check sale status
SELECT saleId, status, paymentStatus, paymentId 
FROM sales WHERE saleId = 1;

-- Check outbox events
SELECT event_type, routing_key, status 
FROM event_outbox 
WHERE JSON_EXTRACT(payload, '$.saleId') = 1
ORDER BY created_at DESC;
```

---

### Test 4: Cancel a Sale

```bash
SALE_ID=2

curl -X POST http://localhost:8005/sales/$SALE_ID/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Customer requested cancellation"
  }'
```

**Expected Result:**
- ✅ Sale status updated to "canceled"
- ✅ Payment status updated to "failed"
- ✅ Event in outbox: sale.canceled

---

### Test 5: Generate Invoice

```bash
SALE_ID=1

curl -X POST http://localhost:8005/sales/$SALE_ID/invoice \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceNumber": "INV-2024-0001"
  }'
```

**Expected Result:**
- ✅ Invoice created
- ✅ Event in outbox: invoice.created

---

### Test 6: Outbox Failure & Retry

**Simulate RabbitMQ Failure:**

```bash
# Stop RabbitMQ
docker stop rabbitmq

# Create a sale (will succeed, but event won't publish)
curl -X POST http://localhost:8005/sales \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": 1,
    "shopId": 1,
    "totalAmount": 50.00,
    "subTotal": 50.00,
    "paymentMethod": "cash",
    "customerName": "Test User"
  }'

# Check outbox - event should be pending
docker exec -it sales-mysql mysql -u root -p invexis_sales \
  -e "SELECT id, event_type, status, retries FROM event_outbox ORDER BY created_at DESC LIMIT 1;"

# Start RabbitMQ again
docker start rabbitmq

# Wait for outbox dispatcher (5 seconds)
sleep 10

# Check outbox - event should be sent now
docker exec -it sales-mysql mysql -u root -p invexis_sales \
  -e "SELECT id, event_type, status, retries, sent_at FROM event_outbox ORDER BY created_at DESC LIMIT 1;"
```

**Expected Result:**
- ✅ Sale created even when RabbitMQ is down
- ✅ Event stays in "pending" status
- ✅ Event published when RabbitMQ comes back
- ✅ No data loss!

---

### Test 7: Check Outbox Statistics

```bash
# Get outbox stats
docker exec -it sales-mysql mysql -u root -p invexis_sales -e "
SELECT 
  status,
  COUNT(*) as count
FROM event_outbox
GROUP BY status;
"

# Expected output:
# +------------------+-------+
# | status           | count |
# +------------------+-------+
# | pending          |     5 |
# | sent             |   123 |
# | permanent_failed |     2 |
# +------------------+-------+
```

---

### Test 8: Monitor Event Flow

**Terminal 1: Watch Service Logs**

```bash
docker logs sales-service -f
```

**Terminal 2: Watch Database**

```bash
watch -n 2 'docker exec -it sales-mysql mysql -u root -p invexis_sales -e "SELECT COUNT(*) as pending FROM event_outbox WHERE status=\"pending\"; SELECT COUNT(*) as sent FROM event_outbox WHERE status=\"sent\";"'
```

**Terminal 3: Create Sales**

```bash
# Create multiple sales
for i in {1..10}; do
  curl -X POST http://localhost:8005/sales \
    -H "Content-Type: application/json" \
    -d "{
      \"companyId\": 1,
      \"shopId\": 1,
      \"totalAmount\": $((RANDOM % 1000 + 100)),
      \"subTotal\": $((RANDOM % 1000 + 100)),
      \"paymentMethod\": \"cash\",
      \"customerName\": \"Customer $i\"
    }"
  sleep 1
done
```

**Watch:**
- Terminal 1: See events being published
- Terminal 2: See pending count decrease, sent count increase

---

## 🔍 Debugging

### Check Failed Events

```sql
-- Find permanently failed events
SELECT 
  id,
  event_type,
  retries,
  error_message,
  created_at,
  last_attempt_at
FROM event_outbox
WHERE status = 'permanent_failed'
ORDER BY created_at DESC;
```

### Check Stale Processing Events

```sql
-- Find events stuck in processing
SELECT 
  id,
  event_type,
  status,
  locked_at,
  TIMESTAMPDIFF(MINUTE, locked_at, NOW()) as minutes_locked
FROM event_outbox
WHERE status = 'processing'
  AND locked_at < NOW() - INTERVAL 5 MINUTE;
```

### Manually Retry Failed Event

```sql
-- Reset a failed event to pending
UPDATE event_outbox
SET status = 'pending',
    retries = 0,
    error_message = NULL
WHERE id = '<event-uuid>';
```

### Check Event Payload

```sql
-- View event payload
SELECT 
  event_type,
  JSON_PRETTY(payload) as payload
FROM event_outbox
WHERE id = '<event-uuid>';
```

---

## 📊 Performance Testing

### Load Test: Create 100 Sales

```bash
# Install Apache Bench (if not installed)
# sudo apt-get install apache2-utils

# Create test data file
cat > sale_data.json << EOF
{
  "companyId": 1,
  "shopId": 1,
  "totalAmount": 100.00,
  "subTotal": 100.00,
  "paymentMethod": "cash",
  "customerName": "Load Test User"
}
EOF

# Run load test
ab -n 100 -c 10 -p sale_data.json -T application/json \
  http://localhost:8005/sales

# Check results
# - Requests per second
# - Time per request
# - Failed requests (should be 0)
```

### Monitor Outbox Processing Speed

```sql
-- Check how fast events are being processed
SELECT 
  DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i') as minute,
  COUNT(*) as events_sent
FROM event_outbox
WHERE status = 'sent'
  AND sent_at > NOW() - INTERVAL 1 HOUR
GROUP BY minute
ORDER BY minute DESC;
```

---

## ✅ Success Criteria

Your implementation is working correctly if:

- ✅ Sales are created successfully
- ✅ Events are added to outbox table
- ✅ Events are published to RabbitMQ within 5 seconds
- ✅ Event status changes from "pending" to "sent"
- ✅ No events are lost when RabbitMQ is down
- ✅ Failed events are retried automatically
- ✅ Permanently failed events are marked after 5 retries
- ✅ No duplicate events are published
- ✅ Database and events are always in sync

---

## 🚨 Common Issues

### Issue 1: Events Not Publishing

**Symptoms:** Events stay in "pending" status

**Solutions:**
1. Check if outbox dispatcher is running
2. Check RabbitMQ connection
3. Check service logs for errors
4. Verify RabbitMQ credentials

### Issue 2: Duplicate Events

**Symptoms:** Same event published multiple times

**Solutions:**
1. Check if multiple workers are running
2. Verify transaction isolation level
3. Check for race conditions in claimPending

### Issue 3: Database Connection Errors

**Symptoms:** Cannot connect to database

**Solutions:**
1. Verify MySQL is running
2. Check database credentials in .env
3. Verify database name exists
4. Check network connectivity

---

## 📚 Next Steps

After successful testing:

1. ✅ Update all controllers to use SalesService
2. ✅ Implement similar pattern for Invoice, Returns
3. ✅ Set up monitoring and alerts
4. ✅ Configure log aggregation
5. ✅ Set up automated tests
6. ✅ Document API endpoints
7. ✅ Create Postman collection

---

**Happy Testing! 🎉**

