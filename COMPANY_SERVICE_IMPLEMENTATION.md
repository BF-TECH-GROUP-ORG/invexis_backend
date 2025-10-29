# 📋 Company Service - Complete Implementation Documentation

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

**Service Name**: Company Service  
**Port**: 8002  
**Database**: PostgreSQL (company-postgres:5432)  
**Message Broker**: RabbitMQ  
**Framework**: Express.js  
**ORM**: Knex.js  

### Purpose
The Company Service manages all company-related operations including:
- Company registration and management
- User-company relationships (CompanyUser)
- Role-based access control (Roles)
- Subscription management

---

## Database Schema

### 1. Companies Table
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  country VARCHAR(100),
  city VARCHAR(100),
  coordinates JSONB,
  tier VARCHAR(50) DEFAULT 'basic',
  status VARCHAR(50) DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Fields**:
- `id`: Unique company identifier (UUID)
- `name`: Company name (required)
- `domain`: Company domain (e.g., invexis.com)
- `email`: Company contact email
- `phone`: Company contact phone
- `country`: Company country
- `city`: Company city
- `coordinates`: Geographic coordinates (JSONB)
- `tier`: Subscription tier (basic, premium, enterprise)
- `status`: Company status (active, inactive, suspended, deleted)
- `created_by`: User who created the company
- `updated_by`: User who last updated the company

### 2. Company Users Table
```sql
CREATE TABLE company_users (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  user_id UUID NOT NULL,
  role_id UUID REFERENCES roles(id),
  status VARCHAR(50) DEFAULT 'active',
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Fields**:
- `id`: Unique relationship identifier
- `company_id`: Reference to company
- `user_id`: Reference to user (from auth-service)
- `role_id`: Reference to role
- `status`: User status in company (active, inactive, suspended)
- `joined_at`: When user joined the company
- `left_at`: When user left the company

### 3. Roles Table
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB,
  is_default BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Fields**:
- `id`: Unique role identifier
- `company_id`: Reference to company
- `name`: Role name (e.g., Admin, Manager, Employee)
- `description`: Role description
- `permissions`: JSON object with permissions
- `is_default`: Whether this is a default role
- `status`: Role status (active, inactive)

### 4. Subscriptions Table
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  plan_name VARCHAR(100) NOT NULL,
  plan_tier VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  billing_cycle VARCHAR(50),
  amount DECIMAL(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  auto_renew BOOLEAN DEFAULT true,
  features JSONB,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Fields**:
- `id`: Unique subscription identifier
- `company_id`: Reference to company
- `plan_name`: Subscription plan name
- `plan_tier`: Plan tier (basic, premium, enterprise)
- `status`: Subscription status (active, expired, canceled, suspended)
- `start_date`: Subscription start date
- `end_date`: Subscription end date
- `billing_cycle`: Billing cycle (monthly, yearly)
- `amount`: Subscription amount
- `currency`: Currency code
- `auto_renew`: Auto-renewal flag
- `features`: JSON object with plan features

---

## Models Implementation

### 1. Company Model
**File**: `src/models/company.model.js`

**Methods**:
- `create(data)` - Create new company
- `findCompanyById(id)` - Find company by ID
- `findCompanyByDomain(domain)` - Find company by domain
- `updateCompany(id, data)` - Update company details
- `deleteCompany(id, actor)` - Soft delete company
- `changeCompanyStatus(id, status, actor)` - Change company status
- `changeTier(id, tier, actor)` - Change subscription tier
- `findAll(filters)` - Get all companies with filters
- `findCompaniesByCountry(country)` - Find companies by country
- `findCompaniesByTier(tier)` - Find companies by tier
- `findCompaniesByStatus(status)` - Find companies by status

### 2. CompanyUser Model
**File**: `src/models/companyUser.model.js`

**Methods**:
- `create(data)` - Add user to company
- `findById(id)` - Find relationship by ID
- `findByCompanyId(companyId)` - Get all users in a company
- `findByUserId(userId)` - Get all companies for a user
- `findByCompanyAndUser(companyId, userId)` - Find specific relationship
- `update(id, data)` - Update relationship
- `delete(id, actor)` - Remove user from company
- `changeStatus(id, status, actor)` - Change user status
- `changeRole(id, roleId, actor)` - Change user role

### 3. Role Model
**File**: `src/models/role.model.js`

**Methods**:
- `create(data)` - Create new role
- `findById(id)` - Find role by ID
- `findByCompanyId(companyId)` - Get all roles for a company
- `findByName(companyId, name)` - Find role by name
- `update(id, data)` - Update role
- `delete(id, actor)` - Soft delete role
- `changeStatus(id, status, actor)` - Change role status
- `setAsDefault(id, actor)` - Set role as default

### 4. Subscription Model
**File**: `src/models/subscription.model.js`

**Methods**:
- `create(data)` - Create new subscription
- `findById(id)` - Find subscription by ID
- `findByCompanyId(companyId)` - Get company subscriptions
- `findActiveByCompanyId(companyId)` - Get active subscription
- `update(id, data)` - Update subscription
- `cancel(id, actor)` - Cancel subscription
- `renew(id, data, actor)` - Renew subscription
- `changeStatus(id, status, actor)` - Change subscription status

---

## Controllers & Routes

### 1. Company Controller
**File**: `src/controllers/companyController.js`

**Endpoints**:
- `POST /api/companies` - Create company
- `GET /api/companies` - Get all companies
- `GET /api/companies/:id` - Get company by ID
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company
- `PATCH /api/companies/:id/status` - Change status
- `PATCH /api/companies/:id/tier` - Change tier
- `GET /api/companies/domain/:domain` - Get by domain
- `GET /api/companies/country/:country` - Get by country
- `GET /api/companies/tier/:tier` - Get by tier

### 2. CompanyUser Controller
**File**: `src/controllers/companyUserController.js`

**Endpoints**:
- `POST /api/company-users` - Add user to company
- `GET /api/company-users/:id` - Get relationship by ID
- `GET /api/company-users/company/:companyId` - Get company users
- `GET /api/company-users/user/:userId` - Get user companies
- `PUT /api/company-users/:id` - Update relationship
- `DELETE /api/company-users/:id` - Remove user
- `PATCH /api/company-users/:id/status` - Change status
- `PATCH /api/company-users/:id/role` - Change role

### 3. Role Controller
**File**: `src/controllers/roleController.js`

**Endpoints**:
- `POST /api/roles` - Create role
- `GET /api/roles/:id` - Get role by ID
- `GET /api/roles/company/:companyId` - Get company roles
- `PUT /api/roles/:id` - Update role
- `DELETE /api/roles/:id` - Delete role
- `PATCH /api/roles/:id/status` - Change status
- `PATCH /api/roles/:id/default` - Set as default

### 4. Subscription Controller
**File**: `src/controllers/subscriptionController.js`

**Endpoints**:
- `POST /api/subscriptions` - Create subscription
- `GET /api/subscriptions/:id` - Get subscription by ID
- `GET /api/subscriptions/company/:companyId` - Get company subscriptions
- `GET /api/subscriptions/company/:companyId/active` - Get active subscription
- `PUT /api/subscriptions/:id` - Update subscription
- `POST /api/subscriptions/:id/cancel` - Cancel subscription
- `POST /api/subscriptions/:id/renew` - Renew subscription
- `PATCH /api/subscriptions/:id/status` - Change status

---

## Event System

### Event Producer
**File**: `src/events/producer.js`

**Published Events** (18 total):

**Company Events**:
- `company.created` - When company is created
- `company.updated` - When company is updated
- `company.deleted` - When company is deleted
- `company.status.changed` - When status changes
- `company.tier.changed` - When tier changes

**CompanyUser Events**:
- `company.user.added` - When user joins company
- `company.user.updated` - When relationship updates
- `company.user.removed` - When user leaves company
- `company.user.status.changed` - When user status changes
- `company.user.role.changed` - When user role changes

**Role Events**:
- `company.role.created` - When role is created
- `company.role.updated` - When role is updated
- `company.role.deleted` - When role is deleted
- `company.role.status.changed` - When role status changes

**Subscription Events**:
- `company.subscription.created` - When subscription created
- `company.subscription.updated` - When subscription updated
- `company.subscription.canceled` - When subscription canceled
- `company.subscription.renewed` - When subscription renewed

### Event Consumer
**File**: `src/events/consumer.js`

**Consumed Events**:
- `user.created` (from auth-service)
- `user.updated` (from auth-service)
- `user.deleted` (from auth-service)
- `payment.completed` (from payment-service)
- `payment.failed` (from payment-service)

---

## Configuration

### RabbitMQ Config
**File**: `src/config/rabbitmq.js`

- Auto-reconnection on failure
- Retry mechanism with exponential backoff
- Exchange: `invexis_events` (topic)
- Queues: `company_service_queue`

### Database Config
**File**: `src/config/index.js`

- PostgreSQL connection via Knex.js
- Connection pooling
- Migration support

### Environment Variables
**File**: `.env.example`

```env
PORT=8002
DB_POSTGRES=postgresql://invexis:invexispass@company-postgres:5432/companydb
RABBITMQ_URL=amqp://invexis:invexispass@rabbitmq:5672
JWT_SECRET=your-secret-key
NODE_ENV=development
```

---

## Port Configuration

**Service Port**: 8002

**Updated Files**:
- `src/index.js` - PORT default set to 8002
- `.env.example` - PORT=8002
- `Dockerfile` - EXPOSE 8002
- `docker-compose.yml` - healthcheck uses port 8002

**Traefik Configuration**:
- Host: `company.local`
- Loadbalancer port: 8002

---

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "details": { ... }
}
```

---

## Total Implementation Stats

- **Models**: 4 (Company, CompanyUser, Role, Subscription)
- **Controllers**: 4
- **Routes**: 4 route files
- **API Endpoints**: 31
- **Event Types**: 18 published, 5 consumed
- **Database Tables**: 4
- **Files Created**: 15+
- **Files Modified**: 5+

---

**Status**: ✅ Complete  
**Last Updated**: 2025-10-15  
**Version**: 1.0

