# 📮 Postman Testing Guide - Invexis Services

## 🎯 Overview

This guide will help you test the **Company Service** and **Sales Service** with the **Transactional Outbox Pattern** using Postman.

---

## 📥 Setup

### Step 1: Import Collection and Environment

1. **Open Postman**
2. **Click "Import"** (top-left)
3. **Select Files**:
   - `postman/Invexis_Services_API_Tests.postman_collection.json`
   - `postman/Invexis_Local_Environment.postman_environment.json`

### Step 2: Select Environment

1. **Top-right corner**, click environment dropdown
2. **Select**: `Invexis Local Environment`

### Step 3: Verify URLs

1. **Click "Variables"** tab
2. **Verify**:
   - `company_service_url`: `http://localhost:8001`
   - `sales_service_url`: `http://localhost:8005`
   - `rabbitmq_url`: `http://localhost:15672`

---

## 🚀 Quick Start Testing

### Test 1: Company Service Health Check

1. **Expand**: 🏢 Company Service
2. **Click**: Health Check
3. **Click**: Send
4. **Expected**: Status 200 OK

```json
{
  "status": "OK",
  "service": "company-service",
  "timestamp": "2024-10-19T..."
}
```

### Test 2: Sales Service Health Check

1. **Expand**: 💰 Sales Service
2. **Click**: Health Check
3. **Click**: Send
4. **Expected**: Status 200 OK

```json
{
  "status": "OK",
  "service": "sales-service",
  "timestamp": "2024-10-19T..."
}
```

---

## 📋 Complete Testing Flow

### Phase 1: Company Service Testing

#### 1. Create Company

1. **Expand**: 🏢 Company Service
2. **Click**: Create Company
3. **Click**: Send
4. **Expected**: Status 201 Created
5. **Note**: `company_id` is automatically saved to environment

**Response Example**:
```json
{
  "success": true,
  "data": {
    "companyId": 1,
    "companyName": "Tech Solutions Ltd",
    "email": "contact@techsolutions.com",
    "status": "active",
    "createdAt": "2024-10-19T..."
  }
}
```

#### 2. Get Company

1. **Click**: Get Company
2. **Click**: Send
3. **Expected**: Status 200 OK
4. **Verify**: Company details match

#### 3. Create Subscription

1. **Click**: Create Subscription
2. **Click**: Send
3. **Expected**: Status 201 Created
4. **Note**: `subscription_id` is automatically saved

**Response Example**:
```json
{
  "success": true,
  "data": {
    "subscriptionId": 1,
    "companyId": 1,
    "planType": "premium",
    "status": "active",
    "createdAt": "2024-10-19T..."
  }
}
```

#### 4. Get Subscription

1. **Click**: Get Subscription
2. **Click**: Send
3. **Expected**: Status 200 OK

#### 5. Update Subscription Status

1. **Click**: Update Subscription Status
2. **Click**: Send
3. **Expected**: Status 200 OK
4. **Verify**: Status changed to "suspended"

---

### Phase 2: Sales Service Testing

#### 1. Create Sale

1. **Expand**: 💰 Sales Service
2. **Click**: Create Sale
3. **Click**: Send
4. **Expected**: Status 201 Created
5. **Note**: `sale_id` is automatically saved

**Response Example**:
```json
{
  "success": true,
  "data": {
    "saleId": 1,
    "companyId": 1,
    "shopId": 1,
    "customerId": 123,
    "totalAmount": 247.50,
    "status": "pending",
    "createdAt": "2024-10-19T..."
  }
}
```

#### 2. Get Sale

1. **Click**: Get Sale
2. **Click**: Send
3. **Expected**: Status 200 OK
4. **Verify**: Sale details match

#### 3. Complete Sale

1. **Click**: Complete Sale
2. **Click**: Send
3. **Expected**: Status 200 OK
4. **Verify**: Status changed to "completed"

#### 4. Cancel Sale (Optional)

1. **Click**: Cancel Sale
2. **Click**: Send
3. **Expected**: Status 200 OK
4. **Verify**: Status changed to "canceled"

#### 5. Generate Invoice

1. **Click**: Generate Invoice
2. **Click**: Send
3. **Expected**: Status 200 OK
4. **Verify**: Invoice created

---

## 📊 Event Verification

### Check Company Service Outbox

1. **Expand**: 📊 Event Verification
2. **Click**: Check Company Service Outbox
3. **Click**: Send
4. **Expected**: See outbox statistics

**Response Example**:
```json
{
  "pending": 0,
  "processing": 0,
  "sent": 5,
  "failed": 0
}
```

### Check Sales Service Outbox

1. **Click**: Check Sales Service Outbox
2. **Click**: Send
3. **Expected**: See outbox statistics

### Get Pending Events

1. **Click**: Get Pending Events (Company)
2. **Click**: Send
3. **Expected**: Empty array (all events sent)

```json
{
  "data": []
}
```

### Get Failed Events

1. **Click**: Get Failed Events (Company)
2. **Click**: Send
3. **Expected**: Empty array (no failures)

```json
{
  "data": []
}
```

---

## 🔄 Event Flow Tests

### Test 1: Create Company → Check Events

1. **Expand**: 🔄 Event Flow Tests
2. **Expand**: 1️⃣ Create Company → Check Events
3. **Click**: Create Company
4. **Click**: Send
5. **Wait 5 seconds**
6. **Click**: Check Outbox Stats
7. **Click**: Send
8. **Verify**: Events were published

**Expected Flow**:
```
Create Company
    ↓
Event added to outbox (status: pending)
    ↓
Wait 5 seconds
    ↓
Outbox dispatcher publishes event
    ↓
Event status changes to "sent"
    ↓
Check stats shows: sent: 1
```

### Test 2: Create Sale → Check Events

1. **Expand**: 2️⃣ Create Sale → Check Events
2. **Click**: Create Sale
3. **Click**: Send
4. **Wait 5 seconds**
5. **Click**: Check Outbox Stats
6. **Click**: Send
7. **Verify**: Multiple events published

**Expected Events**:
- sale.created
- sale.item.added (for each item)

### Test 3: Complete Sale → Check Events

1. **Expand**: 3️⃣ Complete Sale → Check Events
2. **Click**: Complete Sale
3. **Click**: Send
4. **Wait 5 seconds**
5. **Click**: Check Outbox Stats
6. **Click**: Send
7. **Verify**: Completion events published

**Expected Events**:
- sale.completed
- sale.payment.completed

---

## 🔍 Debugging

### Check RabbitMQ Management UI

1. **Open**: http://localhost:15672
2. **Login**: 
   - Username: `invexis`
   - Password: `invexispass`
3. **Check**:
   - Exchanges: `invexis_events`
   - Queues: `company_*`, `sales_*`
   - Messages published

### Check Database Directly

#### Company Service (PostgreSQL)

```bash
# Connect to PostgreSQL
docker exec -it company-postgres psql -U invexis -d invexis_company

# Check outbox table
SELECT id, event_type, status, created_at, sent_at 
FROM event_outbox 
ORDER BY created_at DESC LIMIT 10;

# Check companies
SELECT companyId, companyName, status FROM companies LIMIT 5;

# Check subscriptions
SELECT subscriptionId, companyId, status FROM subscriptions LIMIT 5;
```

#### Sales Service (MySQL)

```bash
# Connect to MySQL
docker exec -it sales-mysql mysql -u invexis -p salesdb

# Check outbox table
SELECT id, event_type, status, created_at, sent_at 
FROM event_outbox 
ORDER BY created_at DESC LIMIT 10;

# Check sales
SELECT saleId, companyId, totalAmount, status FROM sales LIMIT 5;

# Check sales items
SELECT * FROM sales_items LIMIT 5;
```

---

## ✅ Success Criteria

Your testing is successful if:

- ✅ All health checks return 200 OK
- ✅ Companies are created successfully
- ✅ Subscriptions are created successfully
- ✅ Sales are created successfully
- ✅ Events are added to outbox table
- ✅ Events are published to RabbitMQ
- ✅ Event status changes from "pending" to "sent"
- ✅ No events in "permanent_failed" status
- ✅ Outbox statistics show correct counts

---

## 🚨 Common Issues

### Issue 1: Service Not Responding

**Error**: `Could not get any response`

**Solution**:
1. Check if services are running: `docker-compose ps`
2. Check service logs: `docker logs company-service -f`
3. Verify ports: `company_service_url` should be `http://localhost:8001`

### Issue 2: Database Connection Error

**Error**: `Database connection failed`

**Solution**:
1. Check if databases are running: `docker-compose ps`
2. Verify credentials in environment
3. Check database logs: `docker logs company-postgres -f`

### Issue 3: Events Not Publishing

**Error**: Events stay in "pending" status

**Solution**:
1. Check if RabbitMQ is running: `docker-compose ps`
2. Check if outbox dispatcher is running: `docker logs sales-service -f`
3. Verify RabbitMQ connection in service logs

### Issue 4: Duplicate Events

**Error**: Same event published multiple times

**Solution**:
1. Check if multiple workers are running
2. Verify only one outbox dispatcher is active
3. Check transaction isolation level

---

## 📝 Test Scenarios

### Scenario 1: Happy Path

1. Create Company ✅
2. Create Subscription ✅
3. Create Sale ✅
4. Complete Sale ✅
5. Verify all events published ✅

### Scenario 2: Failure & Recovery

1. Stop RabbitMQ
2. Create Sale (should succeed)
3. Check outbox (events should be pending)
4. Start RabbitMQ
5. Wait 5 seconds
6. Check outbox (events should be sent)

### Scenario 3: Multiple Operations

1. Create 5 companies
2. Create 5 subscriptions
3. Create 10 sales
4. Complete 5 sales
5. Verify all events published

---

## 📚 API Endpoints Reference

### Company Service

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| POST | `/companies` | Create company |
| GET | `/companies/:id` | Get company |
| POST | `/subscriptions` | Create subscription |
| GET | `/subscriptions/:id` | Get subscription |
| PATCH | `/subscriptions/:id/status` | Update subscription status |
| GET | `/outbox/stats` | Get outbox statistics |
| GET | `/outbox/pending` | Get pending events |
| GET | `/outbox/failed` | Get failed events |

### Sales Service

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| POST | `/sales` | Create sale |
| GET | `/sales/:id` | Get sale |
| POST | `/sales/:id/complete` | Complete sale |
| POST | `/sales/:id/cancel` | Cancel sale |
| POST | `/sales/:id/invoice` | Generate invoice |
| GET | `/outbox/stats` | Get outbox statistics |
| GET | `/outbox/pending` | Get pending events |
| GET | `/outbox/failed` | Get failed events |

---

## 🎯 Next Steps

After successful testing:

1. ✅ Verify all events are published
2. ✅ Check RabbitMQ queues
3. ✅ Monitor database tables
4. ✅ Test failure scenarios
5. ✅ Document any issues
6. ✅ Proceed to unit testing

---

**Happy Testing! 🎉**

For questions or issues, check the service logs:
```bash
docker logs company-service -f
docker logs sales-service -f
```

