# 📋 Sales Service Events - Quick Reference Card

## 📤 Events Published by Sales Service (22 Total)

### Sale Lifecycle Events (5)
| Event Key | When to Publish | Payload Example |
|-----------|----------------|-----------------|
| `sale.created` | New sale created | `{ saleId, companyId, shopId, totalAmount, customerId }` |
| `sale.updated` | Sale details updated | `{ saleId, updatedFields, oldValues, newValues }` |
| `sale.completed` | Sale successfully completed | `{ saleId, totalAmount, paymentId, completedAt }` |
| `sale.canceled` | Sale was canceled | `{ saleId, reason, canceledBy, canceledAt }` |
| `sale.status.changed` | Sale status changed | `{ saleId, oldStatus, newStatus, changedAt }` |

### Sale Payment Events (4)
| Event Key | When to Publish | Payload Example |
|-----------|----------------|-----------------|
| `sale.payment.pending` | Payment initiated | `{ saleId, amount, paymentMethod, initiatedAt }` |
| `sale.payment.completed` | Payment successful | `{ saleId, paymentId, amount, paidAt }` |
| `sale.payment.failed` | Payment failed | `{ saleId, paymentId, reason, failedAt }` |
| `sale.payment.refunded` | Payment refunded | `{ saleId, paymentId, refundAmount, refundedAt }` |

### Invoice Events (5)
| Event Key | When to Publish | Payload Example |
|-----------|----------------|-----------------|
| `invoice.created` | Invoice generated | `{ invoiceId, saleId, invoiceNumber, totalAmount }` |
| `invoice.sent` | Invoice sent to customer | `{ invoiceId, saleId, sentTo, sentAt }` |
| `invoice.paid` | Invoice marked as paid | `{ invoiceId, saleId, paidAmount, paidAt }` |
| `invoice.overdue` | Invoice is overdue | `{ invoiceId, saleId, dueDate, overdueAmount }` |
| `invoice.canceled` | Invoice canceled | `{ invoiceId, saleId, reason, canceledAt }` |

### Sales Return Events (5)
| Event Key | When to Publish | Payload Example |
|-----------|----------------|-----------------|
| `sale.return.created` | Return request created | `{ returnId, saleId, returnAmount, reason }` |
| `sale.return.approved` | Return approved | `{ returnId, saleId, approvedBy, approvedAt }` |
| `sale.return.rejected` | Return rejected | `{ returnId, saleId, rejectedBy, reason }` |
| `sale.return.completed` | Return completed | `{ returnId, saleId, completedAt }` |
| `sale.refund.processed` | Refund processed | `{ returnId, saleId, refundAmount, processedAt }` |

### Sales Item Events (3)
| Event Key | When to Publish | Payload Example |
|-----------|----------------|-----------------|
| `sale.item.added` | Item added to sale | `{ saleId, itemId, productId, quantity, price }` |
| `sale.item.updated` | Item updated | `{ saleId, itemId, updatedFields }` |
| `sale.item.removed` | Item removed | `{ saleId, itemId, productId, reason }` |

---

## 📥 Events Consumed by Sales Service

### From Inventory Service
| Event Pattern | Handler | Events Handled |
|---------------|---------|----------------|
| `inventory.#` | `inventoryEvent.handler.js` | `product.updated`, `product.stock.changed`, `product.out_of_stock`, `product.deleted`, `product.price.changed` |

**Actions Taken**:
- Log product updates
- Monitor stock levels
- Alert on low stock
- Handle out-of-stock scenarios
- Maintain historical data

### From Payment Service
| Event Pattern | Handler | Events Handled |
|---------------|---------|----------------|
| `payment.#` | `paymentEvent.handler.js` | `payment.completed`, `payment.failed`, `payment.refunded`, `payment.pending` |

**Actions Taken**:
- Update sale payment status
- Update sale status (completed/canceled)
- Record payment ID
- Handle refunds

### From Shop Service
| Event Pattern | Handler | Events Handled |
|---------------|---------|----------------|
| `shop.#` | `shopEvent.handler.js` | `shop.created`, `shop.updated`, `shop.deleted`, `shop.status.changed`, `shop.settings.updated` |

**Actions Taken**:
- Track shop lifecycle
- Handle shop activation/deactivation
- Archive data for closed shops
- Update shop settings

### From Shop Service (Customer Events)
| Event Pattern | Handler | Events Handled |
|---------------|---------|----------------|
| `customer.#` | `customerEvent.handler.js` | `customer.created`, `customer.updated`, `customer.deleted`, `customer.status.changed`, `customer.address.updated`, `customer.contact.updated` |

**Actions Taken**:
- Update customer info in sales
- Sync contact information
- Handle customer status changes
- Block sales for suspended customers

---

## 🔧 Usage Examples

### Publishing Events

```javascript
const { emit } = require('../events/producer');

// Create sale
await emit('sale.created', {
  saleId: 123,
  companyId: 1,
  shopId: 5,
  totalAmount: 150.00,
  customerId: 456
});

// Payment completed
await emit('sale.payment.completed', {
  saleId: 123,
  paymentId: 789,
  amount: 150.00,
  paidAt: new Date()
});

// Generate invoice
await emit('invoice.created', {
  invoiceId: 321,
  saleId: 123,
  invoiceNumber: 'INV-2024-0001',
  totalAmount: 150.00
});

// Create return
await emit('sale.return.created', {
  returnId: 111,
  saleId: 123,
  returnAmount: 50.00,
  reason: 'Defective product'
});
```

### Consuming Events (Automatic)

Events are automatically consumed by the handlers. No manual code needed in controllers.

The handlers will:
1. Receive the event from RabbitMQ
2. Process the event based on type
3. Update database if needed
4. Log the action
5. Publish follow-up events if needed

---

## 📊 Event Flow Patterns

### Pattern 1: Complete Sale
```
1. sale.created
2. sale.item.added (for each item)
3. sale.payment.pending
4. [Consume: payment.completed]
5. sale.completed
6. invoice.created
7. invoice.sent
```

### Pattern 2: Failed Sale
```
1. sale.created
2. sale.item.added
3. sale.payment.pending
4. [Consume: payment.failed]
5. sale.canceled
```

### Pattern 3: Sale Return
```
1. sale.return.created
2. sale.return.approved
3. sale.refund.processed
4. [Consume: payment.refunded]
5. sale.payment.refunded
6. sale.return.completed
```

### Pattern 4: Inventory Update
```
1. [Consume: product.updated]
2. Log product changes
3. [Consume: product.stock.changed]
4. Check stock levels
5. Alert if low stock
```

---

## 🎯 Quick Commands

### Check RabbitMQ Queues
```bash
# Access RabbitMQ management
http://localhost:15672
# Username: invexis
# Password: invexispass

# Check sales service queues:
# - sales_inventory_events_queue
# - sales_payment_events_queue
# - sales_shop_events_queue
# - sales_customer_events_queue
```

### Monitor Event Logs
```bash
# Watch sales service logs
docker logs sales-service -f

# Filter for specific events
docker logs sales-service -f | grep "sale.created"
docker logs sales-service -f | grep "payment.completed"
```

### Test Event Publishing
```bash
# Create a sale (will publish sale.created)
curl -X POST http://localhost:8005/api/sales \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": 1,
    "shopId": 1,
    "items": [
      {
        "productId": 10,
        "quantity": 2,
        "unitPrice": 25.00
      }
    ]
  }'
```

---

## 🔍 Debugging Events

### Check if Event was Published
```bash
# In RabbitMQ Management UI
# 1. Go to Exchanges → invexis_events
# 2. Check "Publish rate" graph
# 3. Go to Queues → check message counts
```

### Check if Event was Consumed
```bash
# Check sales service logs
docker logs sales-service --tail 100 | grep "💰\|📦\|🏪\|👤"

# Emojis used in handlers:
# 💰 - Payment events
# 📦 - Inventory events
# 🏪 - Shop events
# 👤 - Customer events
```

### Verify Database Updates
```bash
# Check if payment status was updated
docker exec -it sales-mysql mysql -u invexis -p
USE salesdb;
SELECT saleId, paymentStatus, status FROM sales WHERE saleId = 123;
```

---

## ⚠️ Important Notes

1. **Event Publishing**: Always publish events AFTER database operations succeed
2. **Error Handling**: All handlers have try-catch blocks
3. **Idempotency**: Handlers should be idempotent (safe to process same event multiple times)
4. **Historical Data**: Never update historical sales data from events
5. **Async Processing**: Events are processed asynchronously

---

## 📁 File Locations

```
services/sales-service/src/events/
├── config/
│   ├── eventPublishers.config.js  ← 22 event types defined
│   └── eventConsumers.config.js   ← 4 consumers defined
├── handlers/
│   ├── inventoryEvent.handler.js  ← Handles inventory.#
│   ├── paymentEvent.handler.js    ← Handles payment.#
│   ├── shopEvent.handler.js       ← Handles shop.#
│   └── customerEvent.handler.js   ← Handles customer.#
├── producer.js                     ← Event publishing
└── consumer.js                     ← Event consumption
```

---

**Quick Stats**:
- 📤 Events Published: 22
- 📥 Event Consumers: 4
- 🎯 Event Handlers: 4
- 📋 Event Queues: 4
- 🔄 Event Patterns: 4

**Status**: ✅ Fully Configured  
**Last Updated**: 2025-10-19

