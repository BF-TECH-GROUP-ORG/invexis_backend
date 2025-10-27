# 🚀 Postman Collection - Quick Start Guide

## 📋 Overview

**File**: `postman/Invexis_Complete_API_Collection.postman_collection.json`

**Total Endpoints**: 40
- **Company Service**: 37 endpoints
- **Sales Service**: 3 endpoints

## 📥 Import Instructions

### Step 1: Import Collection
1. Open Postman
2. Click **Import** button (top left)
3. Select **File** tab
4. Choose: `postman/Invexis_Complete_API_Collection.postman_collection.json`
5. Click **Import**

### Step 2: Import Environment
1. Click **Import** button again
2. Select **File** tab
3. Choose: `postman/Invexis_Local_Environment.postman_environment.json`
4. Click **Import**

### Step 3: Select Environment
1. Click environment dropdown (top right)
2. Select **Invexis Local Environment**

## 🏢 Company Service Endpoints (37)

### Companies (10)
- `POST /companies` - Create Company
- `GET /companies` - Get All Companies
- `GET /companies/:id` - Get Company by ID
- `GET /companies/domain/:domain` - Get by Domain
- `GET /companies/active` - Get Active Companies
- `PUT /companies/:id` - Update Company
- `PATCH /companies/:id/status` - Change Status
- `PATCH /companies/:id/tier` - Change Tier
- `PATCH /companies/:id/reactivate` - Reactivate
- `DELETE /companies/:id` - Delete Company

### Roles (8)
- `POST /roles` - Create Role
- `GET /roles/company/:companyId` - Get Roles by Company
- `GET /roles/:id` - Get Role by ID
- `GET /roles/company/:companyId/name/:name` - Get by Name
- `PUT /roles/:id` - Update Role
- `POST /roles/:id/permissions` - Add Permission
- `DELETE /roles/:id/permissions` - Remove Permission
- `DELETE /roles/:id` - Delete Role

### Company Users (7)
- `POST /company-users` - Assign User to Company
- `GET /company-users/company/:companyId` - Get Users by Company
- `GET /company-users/user/:userId` - Get Companies by User
- `GET /company-users/company/:companyId/user/:userId` - Get Relation
- `PATCH /company-users/company/:companyId/user/:userId/role` - Update Role
- `PATCH /company-users/company/:companyId/user/:userId/suspend` - Suspend User
- `DELETE /company-users/company/:companyId/user/:userId` - Remove User

### Subscriptions (12)
- `POST /subscriptions` - Create Subscription
- `GET /subscriptions/company/:companyId` - Get Subscription
- `GET /subscriptions/company/:companyId/status` - Check Status
- `PUT /subscriptions/company/:companyId` - Update Subscription
- `POST /subscriptions/company/:companyId/renew` - Renew Subscription
- `PATCH /subscriptions/company/:companyId/deactivate` - Deactivate
- `GET /subscriptions/company/:companyId/features` - Get Features
- `POST /subscriptions/company/:companyId/check-feature` - Check Feature
- `GET /subscriptions/company/:companyId/enabled-features` - Enabled Features
- `GET /subscriptions/company/:companyId/disabled-features` - Disabled Features
- `GET /subscriptions/company/:companyId/upgrade-suggestions` - Upgrade Suggestions
- `GET /subscriptions/company/:companyId/summary` - Subscription Summary

## 📊 Sales Service Endpoints (3)

### Sales (9)
- `POST /sales` - Create Sale
- `GET /sales` - List All Sales
- `GET /sales/:id` - Get Sale by ID
- `PUT /sales/:id` - Update Sale
- `DELETE /sales/:id` - Delete Sale
- `GET /sales/customer/:customerId` - Get Customer Purchases
- `GET /sales/reports/sales` - Sales Report
- `GET /sales/trends/top-products` - Top Selling Products
- `GET /sales/trends/revenue` - Revenue Trend

### Returns (1)
- `POST /sales/return` - Create Return

## 🔄 Testing Workflow

### Recommended Order

1. **Company Service - Setup**
   - Create Company (saves `company_id`)
   - Create Role (saves `role_id`)
   - Create Subscription (saves `subscription_id`)

2. **Company Service - Queries**
   - Get Company by ID
   - Get All Companies
   - Get Subscription Features
   - Check Feature Access

3. **Sales Service - Setup**
   - Create Sale (saves `sale_id`)

4. **Sales Service - Queries**
   - Get Sale by ID
   - List All Sales
   - Get Sales Report

5. **Advanced Tests**
   - Update Company
   - Change Company Tier
   - Renew Subscription
   - Get Upgrade Suggestions

## 🔑 Environment Variables

| Variable | Default | Auto-Populated |
|----------|---------|-----------------|
| `company_service_url` | `http://localhost:3001/company` | No |
| `sales_service_url` | `http://localhost:3002/sales` | No |
| `company_id` | - | Yes (from Create Company) |
| `subscription_id` | - | Yes (from Create Subscription) |
| `sale_id` | - | Yes (from Create Sale) |
| `role_id` | - | Manual |

## ✨ Features

✅ **Auto-save Variables** - IDs automatically extracted from responses
✅ **Test Scripts** - Response validation included
✅ **Organized Structure** - Grouped by service and resource
✅ **Sample Data** - Realistic request bodies
✅ **Error Handling** - Proper HTTP methods and status codes

## 🐛 Troubleshooting

### Variables Not Populating
- Ensure response contains `data.id` or `data.companyId`
- Check response status is 200 or 201
- Verify environment is selected

### Connection Refused
- Ensure services are running on correct ports
- Check `company_service_url` and `sales_service_url`
- Verify environment variables

### Invalid Requests
- Check request body format (JSON)
- Verify required fields are present
- Use sample data as template

## 📞 Support

For issues or questions:
1. Check service logs
2. Verify database connectivity
3. Ensure RabbitMQ is running
4. Review request/response in Postman

---

**Ready to test!** 🚀

