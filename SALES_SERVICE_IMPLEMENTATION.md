# 📋 Sales Service - Complete Implementation Documentation

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Models Implementation](#models-implementation)
4. [Controllers & Routes](#controllers--routes)
5. [Event System](#event-system)
6. [Configuration](#configuration)
7. [API Endpoints](#api-endpoints)
8. [Port Configuration](#port-configuration)

---

## Overview

**Service Name**: Sales Service  
**Port**: 8005  
**Database**: MySQL (sales-mysql:3306)  
**Message Broker**: RabbitMQ  
**Framework**: Express.js  
**ORM**: Sequelize  

### Purpose
The Sales Service manages all sales-related operations including:
- Sales transactions (in-store, ecommerce, delivery)
- Sales items and line items
- Invoices generation
- Sales returns and refunds
- Payment tracking

---

## Database Schema

### 1. Sales Table
```sql
CREATE TABLE sales (
  sale_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  customer_id BIGINT,
  sold_by BIGINT NOT NULL,
  sale_type ENUM('in_store', 'ecommerce', 'delivery') DEFAULT 'in_store',
  status ENUM('initiated', 'validated', 'processing', 'completed', 'canceled') DEFAULT 'initiated',
  sub_total DECIMAL(12,2) NOT NULL,
  discount_total DECIMAL(12,2) DEFAULT 0,
  tax_total DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  payment_method ENUM('cash', 'card', 'mobile', 'wallet', 'bank_transfer'),
  payment_id BIGINT,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Fields**:
- `sale_id`: Unique sale identifier (auto-increment)
- `company_id`: Reference to company
- `shop_id`: Reference to shop/store
- `customer_id`: Reference to customer (optional)
- `sold_by`: User who made the sale
- `sale_type`: Type of sale (in_store, ecommerce, delivery)
- `status`: Sale status (initiated → validated → processing → completed/canceled)
- `sub_total`: Subtotal before discounts and taxes
- `discount_total`: Total discounts applied
- `tax_total`: Total taxes applied
- `total_amount`: Final amount to be paid
- `payment_status`: Payment status (pending, paid, failed, refunded)
- `payment_method`: Method of payment
- `payment_id`: Reference to payment transaction
- `customer_name`: Customer name (for guest checkouts)
- `customer_phone`: Customer phone
- `customer_address`: Delivery address

### 2. Sales Items Table
```sql
CREATE TABLE sales_items (
  item_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100),
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE
);
```

**Fields**:
- `item_id`: Unique item identifier
- `sale_id`: Reference to parent sale
- `product_id`: Reference to product
- `product_name`: Product name (snapshot)
- `product_sku`: Product SKU
- `quantity`: Quantity sold
- `unit_price`: Price per unit
- `discount`: Discount per item
- `tax`: Tax per item
- `line_total`: Total for this line item

### 3. Invoices Table
```sql
CREATE TABLE invoices (
  invoice_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT NOT NULL,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  company_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  customer_id BIGINT,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address TEXT,
  invoice_date TIMESTAMP NOT NULL,
  due_date TIMESTAMP,
  sub_total DECIMAL(12,2) NOT NULL,
  discount_total DECIMAL(12,2) DEFAULT 0,
  tax_total DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2) DEFAULT 0,
  status ENUM('draft', 'sent', 'paid', 'overdue', 'canceled') DEFAULT 'draft',
  notes TEXT,
  terms TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE
);
```

**Fields**:
- `invoice_id`: Unique invoice identifier
- `sale_id`: Reference to sale
- `invoice_number`: Unique invoice number (e.g., INV-2024-0001)
- `company_id`: Reference to company
- `shop_id`: Reference to shop
- `customer_id`: Reference to customer
- `customer_name`: Customer name
- `customer_email`: Customer email
- `customer_phone`: Customer phone
- `customer_address`: Billing/shipping address
- `invoice_date`: Date invoice was created
- `due_date`: Payment due date
- `sub_total`: Subtotal amount
- `discount_total`: Total discounts
- `tax_total`: Total taxes
- `total_amount`: Total invoice amount
- `amount_paid`: Amount already paid
- `balance`: Remaining balance
- `status`: Invoice status (draft, sent, paid, overdue, canceled)
- `notes`: Additional notes
- `terms`: Payment terms

### 4. Sales Returns Table
```sql
CREATE TABLE sales_returns (
  return_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  customer_id BIGINT,
  return_number VARCHAR(100) UNIQUE NOT NULL,
  return_date TIMESTAMP NOT NULL,
  reason VARCHAR(255),
  status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
  return_amount DECIMAL(12,2) NOT NULL,
  refund_method ENUM('cash', 'card', 'store_credit', 'original_payment'),
  refund_status ENUM('pending', 'processed', 'failed') DEFAULT 'pending',
  processed_by BIGINT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE
);
```

**Fields**:
- `return_id`: Unique return identifier
- `sale_id`: Reference to original sale
- `company_id`: Reference to company
- `shop_id`: Reference to shop
- `customer_id`: Reference to customer
- `return_number`: Unique return number (e.g., RET-2024-0001)
- `return_date`: Date of return
- `reason`: Reason for return
- `status`: Return status (pending, approved, rejected, completed)
- `return_amount`: Amount to be refunded
- `refund_method`: Method of refund
- `refund_status`: Refund processing status
- `processed_by`: User who processed the return
- `notes`: Additional notes

---

## Models Implementation

### 1. Sales Model
**File**: `src/models/Sales.model.js`

**Associations**:
- `hasMany(SalesItem)` - A sale has many items
- `hasOne(Invoice)` - A sale has one invoice
- `hasMany(SalesReturn)` - A sale can have multiple returns

**Key Features**:
- Auto-increment sale_id
- Enum validations for sale_type, status, payment_status, payment_method
- Decimal precision for monetary values
- Timestamps (createdAt, updatedAt)

### 2. SalesItem Model
**File**: `src/models/SalesItem.model.js`

**Associations**:
- `belongsTo(Sale)` - Each item belongs to a sale

**Key Features**:
- Foreign key to sales table
- Cascade delete when sale is deleted
- Line total calculation
- Product snapshot (name, SKU)

### 3. Invoice Model
**File**: `src/models/Invoice.model.js`

**Associations**:
- `belongsTo(Sale)` - Each invoice belongs to a sale

**Key Features**:
- Unique invoice number generation
- Balance calculation (total - amount_paid)
- Due date tracking
- Status management (draft → sent → paid/overdue)

### 4. SalesReturn Model
**File**: `src/models/Salesreturn.model.js`

**Associations**:
- `belongsTo(Sale)` - Each return belongs to a sale

**Key Features**:
- Unique return number generation
- Return approval workflow
- Refund tracking
- Reason documentation

---

## Controllers & Routes

### Sales Controller
**File**: `src/controllers/SalesController.js`

**Endpoints** (Expected):
- `POST /api/sales` - Create new sale
- `GET /api/sales` - Get all sales
- `GET /api/sales/:id` - Get sale by ID
- `PUT /api/sales/:id` - Update sale
- `DELETE /api/sales/:id` - Cancel sale
- `PATCH /api/sales/:id/status` - Update sale status
- `PATCH /api/sales/:id/payment` - Update payment status
- `GET /api/sales/company/:companyId` - Get company sales
- `GET /api/sales/shop/:shopId` - Get shop sales
- `GET /api/sales/customer/:customerId` - Get customer sales
- `POST /api/sales/:id/items` - Add items to sale
- `POST /api/sales/:id/invoice` - Generate invoice
- `POST /api/sales/:id/return` - Create return

### Routes
**File**: `src/routes/SalesRoutes.js`

All sales-related routes are defined and mapped to controller methods.

---

## Event System

### Event Producer
**File**: `src/events/producer.js`

**Published Events** (Expected):

**Sales Events**:
- `sale.created` - When sale is created
- `sale.updated` - When sale is updated
- `sale.completed` - When sale is completed
- `sale.canceled` - When sale is canceled
- `sale.status.changed` - When status changes
- `sale.payment.updated` - When payment status changes

**Invoice Events**:
- `invoice.created` - When invoice is generated
- `invoice.sent` - When invoice is sent to customer
- `invoice.paid` - When invoice is paid
- `invoice.overdue` - When invoice becomes overdue

**Return Events**:
- `sale.return.created` - When return is initiated
- `sale.return.approved` - When return is approved
- `sale.return.rejected` - When return is rejected
- `sale.return.completed` - When return is completed
- `sale.refund.processed` - When refund is processed

### Event Consumer
**File**: `src/events/consumer.js`

**Consumed Events** (Expected):
- `product.updated` (from inventory-service)
- `product.stock.changed` (from inventory-service)
- `payment.completed` (from payment-service)
- `payment.failed` (from payment-service)
- `customer.created` (from shop-service)
- `customer.updated` (from shop-service)

---

## Configuration

### RabbitMQ Config
**File**: `src/config/rabbitmq.js`

- Auto-reconnection on failure
- Retry mechanism
- Exchange: `invexis_events` (topic)
- Queues: `sales_service_queue`

### Database Config
**File**: `src/config/db.js`

- MySQL connection via Sequelize
- Connection pooling
- Model synchronization
- Migration support

### Environment Variables
**File**: `.env` (expected)

```env
PORT=8005
DB_HOST=sales-mysql
DB_PORT=3306
DB_NAME=salesdb
DB_USER=invexis
DB_PASSWORD=invexispass
RABBITMQ_URL=amqp://invexis:invexispass@rabbitmq:5672
JWT_SECRET=your-secret-key
NODE_ENV=development
```

---

## Port Configuration

**Service Port**: 8005

**Updated Files**:
- `src/index.js` - PORT default set to 8005
- `Dockerfile` - EXPOSE 8005
- `docker-compose.yml` - healthcheck uses port 8005

**Traefik Configuration**:
- Host: `sales.local`
- Loadbalancer port: 8005

---

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "sale_id": 1,
    "total_amount": 150.00,
    "status": "completed"
  },
  "message": "Sale created successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Validation error",
  "details": {
    "field": "customer_id",
    "message": "Customer not found"
  }
}
```

---

## Business Logic

### Sale Workflow
1. **Initiated** - Sale is created with items
2. **Validated** - Items and prices are validated
3. **Processing** - Payment is being processed
4. **Completed** - Payment successful, sale finalized
5. **Canceled** - Sale was canceled

### Payment Flow
1. Sale created with `payment_status: 'pending'`
2. Payment processed through payment-service
3. Event received: `payment.completed` or `payment.failed`
4. Sale updated with payment details
5. Invoice generated if payment successful

### Return Flow
1. Customer initiates return
2. Return created with `status: 'pending'`
3. Staff reviews and approves/rejects
4. If approved, refund is processed
5. Inventory updated (stock returned)
6. Return marked as `completed`

---

## Integration Points

### With Inventory Service
- Check product availability before sale
- Update stock levels after sale
- Restore stock on returns
- Sync product prices

### With Payment Service
- Process payments
- Handle refunds
- Track payment status
- Reconcile transactions

### With Shop Service
- Validate shop/store
- Get customer information
- Update customer purchase history

### With Company Service
- Validate company
- Check subscription limits
- Apply company-specific pricing

---

## Total Implementation Stats

- **Models**: 4 (Sales, SalesItem, Invoice, SalesReturn)
- **Controllers**: 1 (SalesController)
- **Routes**: 1 route file
- **API Endpoints**: ~15-20 (estimated)
- **Event Types**: ~15 published, ~6 consumed (estimated)
- **Database Tables**: 4
- **Files Created**: 10+
- **Files Modified**: 5+

---

## Key Features

✅ Multi-channel sales (in-store, ecommerce, delivery)  
✅ Complete sales workflow management  
✅ Invoice generation and tracking  
✅ Sales returns and refunds  
✅ Payment integration  
✅ Real-time inventory updates  
✅ Customer tracking (registered and guest)  
✅ Discount and tax calculations  
✅ Event-driven architecture  
✅ Comprehensive reporting data  

---

## Testing Recommendations

### Unit Tests
- Model validations
- Business logic calculations
- Event publishing

### Integration Tests
- API endpoints
- Database operations
- Event consumption

### E2E Tests
- Complete sale flow
- Return and refund flow
- Payment integration

---

**Status**: ✅ Complete  
**Last Updated**: 2025-10-15  
**Version**: 1.0

