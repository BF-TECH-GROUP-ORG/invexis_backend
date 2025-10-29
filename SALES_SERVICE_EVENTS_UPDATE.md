# 🔄 Sales Service Events System - Updated

## Overview

Updated the sales-service event system to be sales-specific instead of using company-service event configurations. All event publishers, consumers, and handlers are now properly configured for sales operations.

---

## 📝 Changes Made

### 1. Event Publishers Configuration
**File**: `services/sales-service/src/events/config/eventPublishers.config.js`

**Before**: Company and subscription events (copied from company-service)
**After**: Sales-specific events

#### Event Categories (5 categories, 22 event types):

**Sale Lifecycle Events (5 events)**:
- `sale.created` - A new sale was created
- `sale.updated` - Sale details updated
- `sale.completed` - Sale successfully completed
- `sale.canceled` - Sale was canceled
- `sale.status.changed` - Sale status changed

**Sale Payment Events (4 events)**:
- `sale.payment.pending` - Sale payment is pending
- `sale.payment.completed` - Sale payment completed successfully
- `sale.payment.failed` - Sale payment failed
- `sale.payment.refunded` - Sale payment was refunded

**Invoice Events (5 events)**:
- `invoice.created` - Invoice generated for sale
- `invoice.sent` - Invoice sent to customer
- `invoice.paid` - Invoice marked as paid
- `invoice.overdue` - Invoice is overdue
- `invoice.canceled` - Invoice was canceled

**Sales Return Events (5 events)**:
- `sale.return.created` - Return request created
- `sale.return.approved` - Return request approved
- `sale.return.rejected` - Return request rejected
- `sale.return.completed` - Return process completed
- `sale.refund.processed` - Refund processed for return

**Sales Item Events (3 events)**:
- `sale.item.added` - Item added to sale
- `sale.item.updated` - Sale item updated
- `sale.item.removed` - Item removed from sale

---

### 2. Event Consumers Configuration
**File**: `services/sales-service/src/events/config/eventConsumers.config.js`

**Before**: Auth and payment events (copied from company-service)
**After**: Inventory, payment, shop, and customer events

#### Consumer Configurations (4 consumers):

**Inventory Events Consumer**:
- Queue: `sales_inventory_events_queue`
- Pattern: `inventory.#`
- Handler: `inventoryEvent.handler.js`
- Purpose: Handles product and stock events from inventory-service

**Payment Events Consumer**:
- Queue: `sales_payment_events_queue`
- Pattern: `payment.#`
- Handler: `paymentEvent.handler.js`
- Purpose: Handles payment completion and failure events from payment-service

**Shop Events Consumer**:
- Queue: `sales_shop_events_queue`
- Pattern: `shop.#`
- Handler: `shopEvent.handler.js`
- Purpose: Handles shop/store events from shop-service

**Customer Events Consumer**:
- Queue: `sales_customer_events_queue`
- Pattern: `customer.#`
- Handler: `customerEvent.handler.js`
- Purpose: Handles customer lifecycle events from shop-service

---

### 3. Event Handlers

#### A. Payment Event Handler ✅ Updated
**File**: `services/sales-service/src/events/handlers/paymentEvent.handler.js`

**Changes**:
- Removed company-specific logic (subscription activation, etc.)
- Added sales-specific logic (update sale payment status)
- Handles: `payment.completed`, `payment.failed`, `payment.refunded`, `payment.pending`

**Functionality**:
```javascript
payment.completed → Update sale: paymentStatus='paid', status='completed'
payment.failed    → Update sale: paymentStatus='failed', status='canceled'
payment.refunded  → Update sale: paymentStatus='refunded'
payment.pending   → Update sale: paymentStatus='pending'
```

---

#### B. Inventory Event Handler ✅ Created
**File**: `services/sales-service/src/events/handlers/inventoryEvent.handler.js`

**New Handler** - Handles inventory-related events:
- `product.updated` / `inventory.product.updated` - Product information updated
- `product.stock.changed` / `inventory.stock.updated` - Stock levels changed
- `product.out_of_stock` / `inventory.out_of_stock` - Product out of stock
- `product.deleted` / `inventory.product.deleted` - Product deleted
- `product.price.changed` / `inventory.price.updated` - Price changed

**Functionality**:
- Tracks product updates
- Monitors stock levels
- Alerts on low stock
- Handles out-of-stock scenarios
- Maintains historical data integrity

---

#### C. Shop Event Handler ✅ Created
**File**: `services/sales-service/src/events/handlers/shopEvent.handler.js`

**New Handler** - Handles shop-related events:
- `shop.created` - New shop created
- `shop.updated` - Shop information updated
- `shop.deleted` / `shop.closed` - Shop closed
- `shop.status.changed` - Shop status changed
- `shop.settings.updated` - Shop settings updated

**Functionality**:
- Tracks shop lifecycle
- Handles shop activation/deactivation
- Archives data for closed shops
- Prevents sales for inactive shops

---

#### D. Customer Event Handler ✅ Created
**File**: `services/sales-service/src/events/handlers/customerEvent.handler.js`

**New Handler** - Handles customer-related events:
- `customer.created` - New customer created
- `customer.updated` - Customer information updated
- `customer.deleted` - Customer deleted
- `customer.status.changed` - Customer status changed
- `customer.address.updated` - Customer address updated
- `customer.contact.updated` - Customer contact updated

**Functionality**:
- Updates customer info in sales records
- Handles customer status changes
- Blocks sales for suspended customers
- Maintains historical data
- Syncs contact information

---

#### E. Auth Event Handler ❌ Removed
**File**: `services/sales-service/src/events/handlers/authEvent.handler.js`

**Removed** - Sales service doesn't need auth events directly. User management is handled by company-service.

---

## 📊 Summary Statistics

### Event Publishers
- **Event Categories**: 5
- **Total Event Types**: 22
- **Exchange**: Topic exchange (invexis_events)

### Event Consumers
- **Total Consumers**: 4
- **Total Queues**: 4
- **Event Patterns**: inventory.#, payment.#, shop.#, customer.#

### Event Handlers
- **Created**: 3 new handlers (inventory, shop, customer)
- **Updated**: 1 handler (payment)
- **Removed**: 1 handler (auth)
- **Total Handlers**: 4

---

## 🔗 Integration Points

### Sales Service Publishes To:
1. **Inventory Service** - Stock updates when sale completed
2. **Payment Service** - Payment requests
3. **Notification Service** - Sale confirmations, invoices
4. **Analytics Service** - Sales metrics
5. **Audit Service** - Sales audit trail

### Sales Service Consumes From:
1. **Inventory Service** - Product updates, stock changes
2. **Payment Service** - Payment status updates
3. **Shop Service** - Shop lifecycle events
4. **Shop Service** - Customer lifecycle events

---

## 🎯 Event Flow Examples

### Example 1: Complete Sale Flow
```
1. Sale created → Publish: sale.created
2. Items added → Publish: sale.item.added (for each item)
3. Payment initiated → Publish: sale.payment.pending
4. Payment service processes → Consume: payment.completed
5. Sale updated → Publish: sale.completed
6. Invoice generated → Publish: invoice.created
7. Invoice sent → Publish: invoice.sent
```

### Example 2: Sale Return Flow
```
1. Return requested → Publish: sale.return.created
2. Return approved → Publish: sale.return.approved
3. Refund initiated → Publish: sale.refund.processed
4. Payment service processes → Consume: payment.refunded
5. Sale updated → Publish: sale.payment.refunded
6. Return completed → Publish: sale.return.completed
```

### Example 3: Inventory Update Flow
```
1. Inventory service updates product → Consume: product.updated
2. Sales service logs update
3. If stock low → Alert sales team
4. If out of stock → Consume: product.out_of_stock
5. Prevent new sales for that product
```

### Example 4: Customer Update Flow
```
1. Customer updates profile → Consume: customer.updated
2. Sales service updates customer info in sales records
3. Customer contact changed → Consume: customer.contact.updated
4. Sales service syncs phone/email in sales
```

---

## 🚀 Usage in Controllers

### Publishing Events from Controllers

```javascript
// In SalesController.js
const { emit } = require('../events/producer');

// When creating a sale
await emit('sale.created', {
  saleId: sale.saleId,
  companyId: sale.companyId,
  shopId: sale.shopId,
  totalAmount: sale.totalAmount,
  customerId: sale.customerId
});

// When payment is completed
await emit('sale.payment.completed', {
  saleId: sale.saleId,
  paymentId: payment.id,
  amount: sale.totalAmount
});

// When generating invoice
await emit('invoice.created', {
  invoiceId: invoice.invoiceId,
  saleId: sale.saleId,
  invoiceNumber: invoice.invoiceNumber,
  totalAmount: invoice.totalAmount
});

// When processing return
await emit('sale.return.created', {
  returnId: return.returnId,
  saleId: sale.saleId,
  returnAmount: return.returnAmount,
  reason: return.reason
});
```

---

## ✅ Testing Recommendations

### 1. Test Event Publishing
```bash
# Create a sale and verify events are published
curl -X POST http://localhost:8005/api/sales \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": 1,
    "shopId": 1,
    "items": [...]
  }'

# Check RabbitMQ management console
# http://localhost:15672
# Verify sale.created event was published
```

### 2. Test Event Consumption
```bash
# Simulate payment completion event
# Publish to RabbitMQ: payment.completed
# Verify sale status updated to 'paid'

# Check sales database
docker exec -it sales-mysql mysql -u invexis -p
USE salesdb;
SELECT saleId, paymentStatus, status FROM sales WHERE saleId = 1;
```

### 3. Test Inventory Events
```bash
# Simulate product update from inventory service
# Publish to RabbitMQ: product.updated
# Verify handler logs the update
docker logs sales-service -f
```

---

## 📋 Next Steps

### Immediate
1. ✅ Update event configurations - DONE
2. ✅ Create new handlers - DONE
3. ✅ Update payment handler - DONE
4. ⏳ Integrate events in controllers
5. ⏳ Test event publishing
6. ⏳ Test event consumption

### Short-term
1. Add error handling and retry logic
2. Implement dead letter queues
3. Add event logging to database
4. Create event monitoring dashboard
5. Write unit tests for handlers

### Long-term
1. Implement event sourcing
2. Add event replay capability
3. Create event analytics
4. Implement circuit breakers
5. Add distributed tracing

---

## 🔧 Configuration Files Summary

| File | Purpose | Status |
|------|---------|--------|
| `eventPublishers.config.js` | Define events to publish | ✅ Updated |
| `eventConsumers.config.js` | Define events to consume | ✅ Updated |
| `paymentEvent.handler.js` | Handle payment events | ✅ Updated |
| `inventoryEvent.handler.js` | Handle inventory events | ✅ Created |
| `shopEvent.handler.js` | Handle shop events | ✅ Created |
| `customerEvent.handler.js` | Handle customer events | ✅ Created |
| `authEvent.handler.js` | Handle auth events | ❌ Removed |

---

**Status**: ✅ Complete  
**Date**: 2025-10-19  
**Service**: Sales Service  
**Event System**: Fully configured for sales operations

