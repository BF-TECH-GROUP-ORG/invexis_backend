# 📮 Postman Collection - Quick Reference Card

## 🎯 What's Included

### Collections
- ✅ **Invexis_Services_API_Tests.postman_collection.json** - Complete API test collection
- ✅ **Invexis_Local_Environment.postman_environment.json** - Local environment variables

### Folders in Collection

1. **🏢 Company Service** (5 requests)
   - Health Check
   - Create Company
   - Get Company
   - Create Subscription
   - Get Subscription
   - Update Subscription Status

2. **💰 Sales Service** (6 requests)
   - Health Check
   - Create Sale
   - Get Sale
   - Complete Sale
   - Cancel Sale
   - Generate Invoice

3. **📊 Event Verification** (6 requests)
   - Check Company Service Outbox
   - Check Sales Service Outbox
   - Get Pending Events (Company)
   - Get Pending Events (Sales)
   - Get Failed Events (Company)
   - Get Failed Events (Sales)

4. **🔄 Event Flow Tests** (3 test suites)
   - 1️⃣ Create Company → Check Events
   - 2️⃣ Create Sale → Check Events
   - 3️⃣ Complete Sale → Check Events

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Import (1 min)
```
1. Open Postman
2. Click "Import"
3. Select both JSON files from postman/ folder
4. Click "Import"
```

### Step 2: Select Environment (30 sec)
```
1. Top-right: Click environment dropdown
2. Select: "Invexis Local Environment"
```

### Step 3: Run Tests (3.5 min)
```
1. Expand: 🏢 Company Service
2. Click: Create Company → Send
3. Expand: 💰 Sales Service
4. Click: Create Sale → Send
5. Expand: 📊 Event Verification
6. Click: Check Company Service Outbox → Send
7. Click: Check Sales Service Outbox → Send
```

---

## 📋 Testing Checklist

### Pre-Testing
- [ ] Services running: `docker-compose ps`
- [ ] RabbitMQ running: `docker-compose ps`
- [ ] Databases running: `docker-compose ps`
- [ ] Postman installed
- [ ] Collection imported
- [ ] Environment selected

### Company Service Tests
- [ ] Health Check → 200 OK
- [ ] Create Company → 201 Created
- [ ] Get Company → 200 OK
- [ ] Create Subscription → 201 Created
- [ ] Get Subscription → 200 OK
- [ ] Update Subscription → 200 OK

### Sales Service Tests
- [ ] Health Check → 200 OK
- [ ] Create Sale → 201 Created
- [ ] Get Sale → 200 OK
- [ ] Complete Sale → 200 OK
- [ ] Cancel Sale → 200 OK
- [ ] Generate Invoice → 200 OK

### Event Verification
- [ ] Company Outbox Stats → Shows sent events
- [ ] Sales Outbox Stats → Shows sent events
- [ ] Pending Events (Company) → Empty array
- [ ] Pending Events (Sales) → Empty array
- [ ] Failed Events (Company) → Empty array
- [ ] Failed Events (Sales) → Empty array

### Event Flow Tests
- [ ] Create Company → Events published
- [ ] Create Sale → Multiple events published
- [ ] Complete Sale → Completion events published

---

## 🔑 Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `company_service_url` | http://localhost:8001 | Company Service API |
| `sales_service_url` | http://localhost:8005 | Sales Service API |
| `company_id` | (auto-set) | Company ID from creation |
| `subscription_id` | (auto-set) | Subscription ID from creation |
| `sale_id` | (auto-set) | Sale ID from creation |
| `rabbitmq_url` | http://localhost:15672 | RabbitMQ Management |
| `company_db_*` | PostgreSQL credentials | Company DB access |
| `sales_db_*` | MySQL credentials | Sales DB access |

---

## 📊 Expected Responses

### Create Company (201)
```json
{
  "success": true,
  "data": {
    "companyId": 1,
    "companyName": "Tech Solutions Ltd",
    "email": "contact@techsolutions.com",
    "status": "active"
  }
}
```

### Create Sale (201)
```json
{
  "success": true,
  "data": {
    "saleId": 1,
    "companyId": 1,
    "totalAmount": 247.50,
    "status": "pending"
  }
}
```

### Outbox Stats (200)
```json
{
  "pending": 0,
  "processing": 0,
  "sent": 5,
  "failed": 0
}
```

---

## 🔄 Event Flow Diagram

```
Create Company
    ↓
Event: company.created
    ↓
Outbox: pending → sent
    ↓
RabbitMQ: Published ✅

Create Sale
    ↓
Events: sale.created, sale.item.added
    ↓
Outbox: pending → sent
    ↓
RabbitMQ: Published ✅

Complete Sale
    ↓
Events: sale.completed, sale.payment.completed
    ↓
Outbox: pending → sent
    ↓
RabbitMQ: Published ✅
```

---

## 🧪 Test Execution Order

### Recommended Order
1. Health checks (both services)
2. Create company
3. Create subscription
4. Create sale
5. Complete sale
6. Check outbox stats
7. Verify no failed events

### Alternative: Event Flow Tests
1. Run "1️⃣ Create Company → Check Events"
2. Run "2️⃣ Create Sale → Check Events"
3. Run "3️⃣ Complete Sale → Check Events"

---

## 🔍 Debugging Tips

### If Tests Fail

**Check Service Logs**:
```bash
docker logs company-service -f
docker logs sales-service -f
```

**Check Database**:
```bash
# Company (PostgreSQL)
docker exec -it company-postgres psql -U invexis -d invexis_company \
  -c "SELECT * FROM event_outbox ORDER BY created_at DESC LIMIT 5;"

# Sales (MySQL)
docker exec -it sales-mysql mysql -u invexis -p salesdb \
  -e "SELECT * FROM event_outbox ORDER BY created_at DESC LIMIT 5;"
```

**Check RabbitMQ**:
```
http://localhost:15672
Username: invexis
Password: invexispass
```

---

## 📝 Notes

- **Auto-save**: IDs are automatically saved to environment variables
- **Timestamps**: All responses include `createdAt` timestamp
- **Transactions**: All operations are atomic with outbox pattern
- **Events**: Check outbox stats to verify events were published
- **Retry**: Failed events are retried up to 5 times

---

## 🎯 Success Indicators

✅ All requests return 2xx status codes  
✅ Outbox stats show "sent" events  
✅ No events in "failed" status  
✅ Database records match API responses  
✅ RabbitMQ shows published messages  

---

## 📚 Related Documentation

- `POSTMAN_TESTING_GUIDE.md` - Detailed testing guide
- `SALES_SERVICE_OUTBOX_IMPLEMENTATION.md` - Outbox pattern details
- `TESTING_GUIDE.md` - Comprehensive testing guide
- `IMPLEMENTATION_COMPLETE_SUMMARY.md` - Implementation summary

---

**Ready to test? Import the collection and start sending requests! 🚀**

