# 🏢 Company Service - Invexis

The Company Service is a core microservice in the Invexis platform that manages companies, roles, user-company relationships, and subscriptions. It provides comprehensive multi-tenancy support with role-based access control (RBAC).

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Models](#models)
- [API Endpoints](#api-endpoints)
- [Events](#events)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)

## ✨ Features

- **Company Management**: Create, update, delete, and manage companies
- **Role-Based Access Control (RBAC)**: Define custom roles with granular permissions
- **User-Company Relationships**: Assign users to companies with specific roles
- **Subscription Management**: Handle company subscriptions and billing
- **Event-Driven Architecture**: Publish and consume events via RabbitMQ
- **Multi-Tenancy Support**: Complete isolation between companies
- **Soft Deletes**: Companies can be soft-deleted and reactivated

## 🏗️ Architecture

```
company-service/
├── src/
│   ├── config/           # Database and RabbitMQ configuration
│   ├── controllers/      # Request handlers
│   ├── events/           # Event producers and consumers
│   ├── middlewares/      # Custom middleware
│   ├── models/           # Data models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   ├── app.js            # Express app setup
│   └── index.js          # Entry point
├── migrations/           # Database migrations
└── tests/                # Test files
```

## 📊 Models

### 1. Company
Represents a company/organization in the system.

**Fields:**
- `id` (UUID): Unique identifier
- `name` (String): Company name
- `domain` (String): Company domain (e.g., invexis.com)
- `email` (String): Contact email
- `phone` (String): Contact phone
- `country` (String): Country
- `city` (String): City
- `tier` (String): Subscription tier (basic, premium, enterprise)
- `status` (String): Status (active, suspended, deleted)
- `createdBy`, `updatedBy`: Audit fields
- `createdAt`, `updatedAt`: Timestamps

### 2. Role
Defines roles with permissions for RBAC.

**Fields:**
- `id` (UUID): Unique identifier
- `company_id` (UUID): Company reference
- `name` (String): Role name
- `permissions` (JSON): Array of permissions
- `createdBy`, `updatedBy`: Audit fields
- `createdAt`, `updatedAt`: Timestamps

### 3. CompanyUser
Links users to companies with roles.

**Fields:**
- `id` (UUID): Unique identifier
- `company_id` (UUID): Company reference
- `user_id` (UUID): User reference
- `role_id` (UUID): Role reference
- `status` (String): Status (active, suspended)
- `createdBy`, `updatedBy`: Audit fields
- `createdAt`, `updatedAt`: Timestamps

### 4. Subscription
Manages company subscriptions.

**Fields:**
- `id` (UUID): Unique identifier
- `company_id` (UUID): Company reference
- `tier` (String): Subscription tier
- `start_date` (Date): Subscription start
- `end_date` (Date): Subscription end
- `is_active` (Boolean): Active status
- `amount` (Number): Subscription amount
- `currency` (String): Currency (default: RWF)
- `payment_reference` (String): Payment reference
- `createdAt`, `updatedAt`: Timestamps

## 🔌 API Endpoints

### Companies

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/companies` | Create a new company |
| GET | `/api/companies` | Get all companies (with filters) |
| GET | `/api/companies/:id` | Get company by ID |
| GET | `/api/companies/domain/:domain` | Get company by domain |
| GET | `/api/companies/active` | Get all active companies |
| PUT | `/api/companies/:id` | Update company |
| DELETE | `/api/companies/:id` | Delete company (soft delete) |
| PATCH | `/api/companies/:id/status` | Change company status |
| PATCH | `/api/companies/:id/tier` | Change company tier |
| PATCH | `/api/companies/:id/reactivate` | Reactivate company |

### Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/roles` | Create a new role |
| GET | `/api/roles/company/:companyId` | Get all roles for a company |
| GET | `/api/roles/:id` | Get role by ID |
| GET | `/api/roles/company/:companyId/name/:name` | Get role by name |
| PUT | `/api/roles/:id` | Update role |
| DELETE | `/api/roles/:id` | Delete role |
| POST | `/api/roles/:id/permissions` | Add permission to role |
| DELETE | `/api/roles/:id/permissions` | Remove permission from role |

### Company Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/company-users` | Assign user to company |
| GET | `/api/company-users/company/:companyId` | Get all users in a company |
| GET | `/api/company-users/user/:userId` | Get all companies for a user |
| GET | `/api/company-users/company/:companyId/user/:userId` | Get specific relationship |
| PATCH | `/api/company-users/company/:companyId/user/:userId/role` | Update user role |
| PATCH | `/api/company-users/company/:companyId/user/:userId/suspend` | Suspend user |
| DELETE | `/api/company-users/company/:companyId/user/:userId` | Remove user from company |

### Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/subscriptions` | Create subscription |
| GET | `/api/subscriptions/company/:companyId` | Get subscription by company |
| GET | `/api/subscriptions/company/:companyId/status` | Check subscription status |
| PUT | `/api/subscriptions/company/:companyId` | Update subscription |
| POST | `/api/subscriptions/company/:companyId/renew` | Renew subscription |
| PATCH | `/api/subscriptions/company/:companyId/deactivate` | Deactivate subscription |

## 📡 Events

### Published Events

**Company Events:**
- `company.created` - When a company is created
- `company.updated` - When a company is updated
- `company.deleted` - When a company is deleted
- `company.status.changed` - When company status changes
- `company.tier.changed` - When company tier changes

**Role Events:**
- `role.created` - When a role is created
- `role.updated` - When a role is updated
- `role.deleted` - When a role is deleted
- `role.permission.added` - When a permission is added
- `role.permission.removed` - When a permission is removed

**Company-User Events:**
- `company.user.assigned` - When a user is assigned to a company
- `company.user.role.changed` - When a user's role changes
- `company.user.suspended` - When a user is suspended
- `company.user.removed` - When a user is removed from a company

**Subscription Events:**
- `subscription.created` - When a subscription is created
- `subscription.updated` - When a subscription is updated
- `subscription.renewed` - When a subscription is renewed
- `subscription.deactivated` - When a subscription is deactivated
- `subscription.expiring` - When a subscription is expiring soon

### Consumed Events

- `auth_events` - Events from auth service (user deletions, suspensions)
- `payment_events` - Events from payment service (payment success/failure)

## 🚀 Installation

1. **Install dependencies:**
```bash
cd services/company-service
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Run database migrations:**
```bash
npm run migrate
```

4. **Start the service:**
```bash
# Development
npm run dev

# Production
npm start
```

## ⚙️ Configuration

Environment variables (see `.env.example`):

- `PORT` - Service port (default: 8004)
- `NODE_ENV` - Environment (development/production)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database config
- `RABBITMQ_URL` - RabbitMQ connection URL
- `RABBITMQ_RETRIES` - Number of connection retries
- `RABBITMQ_RETRY_DELAY` - Delay between retries (ms)

## 📝 Usage Examples

### Create a Company
```bash
curl -X POST http://localhost:8004/api/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "domain": "acme.com",
    "email": "contact@acme.com",
    "tier": "premium"
  }'
```

### Create a Role
```bash
curl -X POST http://localhost:8004/api/roles \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "company-uuid",
    "name": "Manager",
    "permissions": ["read:products", "write:products", "manage:users"]
  }'
```

### Assign User to Company
```bash
curl -X POST http://localhost:8004/api/company-users \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "company-uuid",
    "user_id": "user-uuid",
    "role_id": "role-uuid"
  }'
```

## 🧪 Testing

```bash
npm test
```

## 📄 License

ISC

## 👥 Contributing

Please read the main project's contributing guidelines.

