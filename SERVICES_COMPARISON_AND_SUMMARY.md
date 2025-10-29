# 📊 Company Service vs Sales Service - Comparison & Summary

## Quick Comparison Table

| Aspect | Company Service | Sales Service |
|--------|----------------|---------------|
| **Port** | 8002 | 8005 |
| **Database** | PostgreSQL | MySQL |
| **ORM** | Knex.js | Sequelize |
| **Models** | 4 | 4 |
| **Tables** | companies, company_users, roles, subscriptions | sales, sales_items, invoices, sales_returns |
| **Primary Key** | UUID | BIGINT (auto-increment) |
| **Main Purpose** | Company & user management | Sales transactions |
| **Controllers** | 4 | 1 |
| **API Endpoints** | 31 | ~15-20 |
| **Events Published** | 18 | ~15 |
| **Events Consumed** | 5 | ~6 |

---

## Detailed Comparison

### 1. Database Architecture

#### Company Service (PostgreSQL)
- **Why PostgreSQL?**
  - Complex relationships (companies ↔ users ↔ roles)
  - JSONB support for flexible data (permissions, features)
  - Strong ACID compliance for critical business data
  - Better for relational data with many joins

- **Schema Design**:
  - UUID primary keys (better for distributed systems)
  - Soft deletes (status-based)
  - Audit fields (created_by, updated_by)
  - JSONB for flexible data (coordinates, permissions, features)

#### Sales Service (MySQL)
- **Why MySQL?**
  - High-performance for transactional data
  - Better for write-heavy operations (sales transactions)
  - Excellent for time-series data (sales over time)
  - Good for reporting and analytics queries

- **Schema Design**:
  - Auto-increment BIGINT primary keys (simpler, faster)
  - Cascade deletes for related data
  - Decimal precision for monetary values
  - Enum types for status fields

---

### 2. Data Models

#### Company Service Models

**1. Company**
```javascript
{
  id: UUID,
  name: String,
  domain: String,
  tier: Enum('basic', 'premium', 'enterprise'),
  status: Enum('active', 'inactive', 'suspended', 'deleted')
}
```

**2. CompanyUser**
```javascript
{
  id: UUID,
  company_id: UUID,
  user_id: UUID,
  role_id: UUID,
  status: Enum('active', 'inactive', 'suspended')
}
```

**3. Role**
```javascript
{
  id: UUID,
  company_id: UUID,
  name: String,
  permissions: JSONB,
  is_default: Boolean
}
```

**4. Subscription**
```javascript
{
  id: UUID,
  company_id: UUID,
  plan_tier: String,
  status: Enum('active', 'expired', 'canceled', 'suspended'),
  features: JSONB
}
```

#### Sales Service Models

**1. Sale**
```javascript
{
  sale_id: BIGINT,
  company_id: BIGINT,
  shop_id: BIGINT,
  sale_type: Enum('in_store', 'ecommerce', 'delivery'),
  status: Enum('initiated', 'validated', 'processing', 'completed', 'canceled'),
  payment_status: Enum('pending', 'paid', 'failed', 'refunded')
}
```

**2. SalesItem**
```javascript
{
  item_id: BIGINT,
  sale_id: BIGINT,
  product_id: BIGINT,
  quantity: Decimal,
  unit_price: Decimal,
  line_total: Decimal
}
```

**3. Invoice**
```javascript
{
  invoice_id: BIGINT,
  sale_id: BIGINT,
  invoice_number: String (unique),
  status: Enum('draft', 'sent', 'paid', 'overdue', 'canceled'),
  balance: Decimal
}
```

**4. SalesReturn**
```javascript
{
  return_id: BIGINT,
  sale_id: BIGINT,
  return_number: String (unique),
  status: Enum('pending', 'approved', 'rejected', 'completed'),
  refund_status: Enum('pending', 'processed', 'failed')
}
```

---

### 3. API Endpoints Comparison

#### Company Service (31 endpoints)

**Companies (10)**:
- POST /api/companies
- GET /api/companies
- GET /api/companies/:id
- PUT /api/companies/:id
- DELETE /api/companies/:id
- PATCH /api/companies/:id/status
- PATCH /api/companies/:id/tier
- GET /api/companies/domain/:domain
- GET /api/companies/country/:country
- GET /api/companies/tier/:tier

**Company Users (8)**:
- POST /api/company-users
- GET /api/company-users/:id
- GET /api/company-users/company/:companyId
- GET /api/company-users/user/:userId
- PUT /api/company-users/:id
- DELETE /api/company-users/:id
- PATCH /api/company-users/:id/status
- PATCH /api/company-users/:id/role

**Roles (7)**:
- POST /api/roles
- GET /api/roles/:id
- GET /api/roles/company/:companyId
- PUT /api/roles/:id
- DELETE /api/roles/:id
- PATCH /api/roles/:id/status
- PATCH /api/roles/:id/default

**Subscriptions (8)**:
- POST /api/subscriptions
- GET /api/subscriptions/:id
- GET /api/subscriptions/company/:companyId
- GET /api/subscriptions/company/:companyId/active
- PUT /api/subscriptions/:id
- POST /api/subscriptions/:id/cancel
- POST /api/subscriptions/:id/renew
- PATCH /api/subscriptions/:id/status

#### Sales Service (~15-20 endpoints)

**Sales**:
- POST /api/sales
- GET /api/sales
- GET /api/sales/:id
- PUT /api/sales/:id
- DELETE /api/sales/:id
- PATCH /api/sales/:id/status
- PATCH /api/sales/:id/payment
- GET /api/sales/company/:companyId
- GET /api/sales/shop/:shopId
- GET /api/sales/customer/:customerId
- POST /api/sales/:id/items
- POST /api/sales/:id/invoice
- POST /api/sales/:id/return

---

### 4. Event System Comparison

#### Company Service Events

**Published (18 events)**:
- company.created
- company.updated
- company.deleted
- company.status.changed
- company.tier.changed
- company.user.added
- company.user.updated
- company.user.removed
- company.user.status.changed
- company.user.role.changed
- company.role.created
- company.role.updated
- company.role.deleted
- company.role.status.changed
- company.subscription.created
- company.subscription.updated
- company.subscription.canceled
- company.subscription.renewed

**Consumed (5 events)**:
- user.created (from auth-service)
- user.updated (from auth-service)
- user.deleted (from auth-service)
- payment.completed (from payment-service)
- payment.failed (from payment-service)

#### Sales Service Events

**Published (~15 events)**:
- sale.created
- sale.updated
- sale.completed
- sale.canceled
- sale.status.changed
- sale.payment.updated
- invoice.created
- invoice.sent
- invoice.paid
- invoice.overdue
- sale.return.created
- sale.return.approved
- sale.return.rejected
- sale.return.completed
- sale.refund.processed

**Consumed (~6 events)**:
- product.updated (from inventory-service)
- product.stock.changed (from inventory-service)
- payment.completed (from payment-service)
- payment.failed (from payment-service)
- customer.created (from shop-service)
- customer.updated (from shop-service)

---

### 5. Business Logic Comparison

#### Company Service
**Focus**: Organizational structure and access control

**Key Workflows**:
1. **Company Onboarding**
   - Create company
   - Set up subscription
   - Create default roles
   - Add initial users

2. **User Management**
   - Add users to company
   - Assign roles
   - Manage permissions
   - Handle user lifecycle

3. **Subscription Management**
   - Create subscription
   - Track billing
   - Handle renewals
   - Manage tier changes

#### Sales Service
**Focus**: Transaction processing and revenue tracking

**Key Workflows**:
1. **Sale Processing**
   - Create sale
   - Add items
   - Calculate totals
   - Process payment
   - Complete sale

2. **Invoice Management**
   - Generate invoice
   - Send to customer
   - Track payments
   - Handle overdue

3. **Returns & Refunds**
   - Create return request
   - Approve/reject
   - Process refund
   - Update inventory

---

### 6. Integration Points

#### Company Service Integrates With:
- **Auth Service**: User authentication and management
- **Payment Service**: Subscription payments
- **All Services**: Company validation and authorization

#### Sales Service Integrates With:
- **Inventory Service**: Stock management
- **Payment Service**: Transaction processing
- **Shop Service**: Customer and store data
- **Company Service**: Company validation

---

### 7. File Structure Comparison

#### Company Service
```
src/
├── app.js
├── index.js
├── config/
│   ├── index.js (Knex config)
│   ├── knexfile.js
│   └── rabbitmq.js
├── controllers/
│   ├── companyController.js
│   ├── companyUserController.js
│   ├── roleController.js
│   └── subscriptionController.js
├── models/
│   ├── company.model.js
│   ├── companyUser.model.js
│   ├── role.model.js
│   └── subscription.model.js
├── routes/
│   ├── index.js
│   ├── companyRoutes.js
│   ├── companyUserRoutes.js
│   ├── roleRoutes.js
│   └── subscriptionRoutes.js
├── events/
│   ├── producer.js
│   ├── consumer.js
│   ├── config/
│   └── handlers/
├── services/
│   ├── authService.js
│   └── tokenService.js
└── utils/
    ├── jwt.js
    └── hashPassword.js
```

#### Sales Service
```
src/
├── app.js
├── index.js
├── config/
│   ├── db.js (Sequelize config)
│   └── rabbitmq.js
├── controllers/
│   └── SalesController.js
├── models/
│   ├── Sales.model.js
│   ├── SalesItem.model.js
│   ├── Invoice.model.js
│   ├── Salesreturn.model.js
│   └── index.model.js
├── routes/
│   └── SalesRoutes.js
├── events/
│   ├── producer.js
│   ├── consumer.js
│   ├── config/
│   └── handlers/
├── services/
│   ├── authService.js
│   └── tokenService.js
└── utils/
    ├── jwt.js
    └── hashPassword.js
```

---

## Common Patterns

### Both Services Share:

1. **Event-Driven Architecture**
   - RabbitMQ for message broker
   - Topic exchange pattern
   - Event producers and consumers

2. **Authentication & Authorization**
   - JWT-based authentication
   - Token validation
   - Role-based access control

3. **Error Handling**
   - Consistent error response format
   - Try-catch blocks in controllers
   - Async error handling

4. **Configuration Management**
   - Environment variables
   - Separate config files
   - Docker-friendly setup

5. **Health Checks**
   - `/health` endpoint
   - Docker healthcheck integration

6. **Port Standardization**
   - Aligned with Traefik configuration
   - Consistent across all environments

---

## Key Differences

| Feature | Company Service | Sales Service |
|---------|----------------|---------------|
| **Data Nature** | Relatively static | Highly transactional |
| **Write Frequency** | Low to medium | Very high |
| **Read Patterns** | Complex joins | Time-series queries |
| **Primary Keys** | UUID (distributed) | Auto-increment (sequential) |
| **Relationships** | Many-to-many | One-to-many |
| **Data Flexibility** | High (JSONB) | Structured (fixed schema) |
| **Audit Trail** | Full (created_by, updated_by) | Timestamp-based |
| **Delete Strategy** | Soft delete | Cascade delete |

---

## Summary of Work Done

### Company Service ✅
- ✅ Analyzed 4 models (Company, CompanyUser, Role, Subscription)
- ✅ Created 4 controllers with full CRUD operations
- ✅ Implemented 31 API endpoints
- ✅ Set up RabbitMQ event producer (18 event types)
- ✅ Set up RabbitMQ event consumer (5 event types)
- ✅ Configured PostgreSQL with Knex.js
- ✅ Updated port to 8002
- ✅ Created comprehensive documentation

### Sales Service ✅
- ✅ Analyzed 4 models (Sales, SalesItem, Invoice, SalesReturn)
- ✅ Existing controller structure reviewed
- ✅ MySQL with Sequelize configured
- ✅ Event system infrastructure in place
- ✅ Updated port to 8005
- ✅ Created comprehensive documentation

### Port Standardization ✅
- ✅ Updated all 13 services to use ports 8000-8012
- ✅ Aligned with Traefik loadbalancer configuration
- ✅ Updated Docker healthchecks
- ✅ Updated Dockerfiles
- ✅ Updated API Gateway service URLs

---

## Documentation Created

1. **COMPANY_SERVICE_IMPLEMENTATION.md** - Complete company service documentation
2. **SALES_SERVICE_IMPLEMENTATION.md** - Complete sales service documentation
3. **SERVICES_COMPARISON_AND_SUMMARY.md** - This comparison document
4. **PORT_STANDARDIZATION_COMPLETE.md** - Port updates documentation
5. **PORTS_QUICK_REFERENCE.md** - Quick reference for all ports
6. **PORT_MAPPING_ANALYSIS.md** - Original port analysis

---

**Total Services Documented**: 2  
**Total Models**: 8  
**Total API Endpoints**: ~50  
**Total Events**: ~40  
**Status**: ✅ Complete  
**Date**: 2025-10-15

