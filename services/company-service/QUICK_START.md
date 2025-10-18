# 🚀 Quick Start Guide - Company Service

## Prerequisites
- Node.js 20+
- PostgreSQL database
- RabbitMQ server
- Docker (optional)

## Installation Steps

### 1. Install Dependencies
```bash
cd services/company-service
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=8004
NODE_ENV=development

DB_HOST=postgres
DB_PORT=5432
DB_NAME=invexis_company
DB_USER=invexis
DB_PASSWORD=invexispass

RABBITMQ_URL=amqp://invexis:invexispass@rabbitmq:5672
RABBITMQ_RETRIES=5
RABBITMQ_RETRY_DELAY=5000
```

### 3. Run Database Migrations
```bash
cd ../..
npm run migrate:company
```

### 4. Start the Service

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The service will start on `http://localhost:8004`

## Testing the API

### Health Check
```bash
curl http://localhost:8004/health
```

Expected response:
```json
{
  "status": "OK",
  "service": "company-service",
  "timestamp": "2025-10-15T..."
}
```

### Create a Company
```bash
curl -X POST http://localhost:8004/api/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Company",
    "domain": "test.com",
    "email": "contact@test.com",
    "phone": "+250788123456",
    "country": "Rwanda",
    "city": "Kigali",
    "tier": "basic"
  }'
```

### Get All Companies
```bash
curl http://localhost:8004/api/companies
```

### Create a Role
```bash
curl -X POST http://localhost:8004/api/roles \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "YOUR_COMPANY_ID",
    "name": "Admin",
    "permissions": ["read:all", "write:all", "delete:all"]
  }'
```

### Assign User to Company
```bash
curl -X POST http://localhost:8004/api/company-users \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "YOUR_COMPANY_ID",
    "user_id": "YOUR_USER_ID",
    "role_id": "YOUR_ROLE_ID"
  }'
```

### Create Subscription
```bash
curl -X POST http://localhost:8004/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "YOUR_COMPANY_ID",
    "tier": "premium",
    "amount": 50000,
    "currency": "RWF",
    "end_date": "2026-10-15"
  }'
```

## Docker Setup

### Using Docker Compose (Recommended)
```bash
# From project root
docker-compose up company-service
```

### Build Docker Image
```bash
cd services/company-service
docker build -t invexis-company-service .
```

### Run Docker Container
```bash
docker run -p 8004:8004 \
  -e DB_HOST=postgres \
  -e RABBITMQ_URL=amqp://invexis:invexispass@rabbitmq:5672 \
  invexis-company-service
```

## Verify RabbitMQ Integration

1. Access RabbitMQ Management UI: `http://localhost:15672`
   - Username: `invexis`
   - Password: `invexispass`

2. Check for queues:
   - `company_events` - Published events from company service
   - `auth_events` - Consumed events from auth service
   - `payment_events` - Consumed events from payment service

3. Create a company and verify event is published to `company_events` queue

## Common Issues

### Database Connection Error
```
Error: connect ECONNREFUSED
```
**Solution:** Ensure PostgreSQL is running and credentials are correct in `.env`

### RabbitMQ Connection Error
```
Error: connect ECONNREFUSED rabbitmq:5672
```
**Solution:** 
- Ensure RabbitMQ is running
- Check RABBITMQ_URL in `.env`
- Service will continue to run without RabbitMQ (events won't be published)

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::8004
```
**Solution:** Change PORT in `.env` or stop the process using port 8004

## API Documentation

Full API documentation is available in [README.md](./README.md)

### Available Endpoints

**Companies:** 10 endpoints
- CRUD operations
- Status management
- Tier management

**Roles:** 8 endpoints
- CRUD operations
- Permission management

**Company-Users:** 7 endpoints
- User assignment
- Role updates
- Suspension

**Subscriptions:** 6 endpoints
- Subscription management
- Renewal
- Status checking

## Monitoring

### Check Service Logs
```bash
# If running with npm
# Logs appear in terminal

# If running with Docker
docker logs invexis-company-service -f
```

### Monitor Events
Watch RabbitMQ queues in management UI to see events being published and consumed.

## Next Steps

1. **Add Authentication:** Implement JWT middleware for protected routes
2. **Add Authorization:** Check user permissions based on roles
3. **Add Validation:** Use Joi or similar for request validation
4. **Add Tests:** Write unit and integration tests
5. **Add Logging:** Implement structured logging (Winston, Pino)
6. **Add Monitoring:** Set up health checks and metrics

## Support

For issues or questions:
- Check [README.md](./README.md) for detailed documentation
- Review [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for architecture details
- Check existing issues in the repository

## Development Tips

1. **Use nodemon for development:** Already configured in `npm run dev`
2. **Test with Postman:** Import the API endpoints for easier testing
3. **Monitor RabbitMQ:** Keep the management UI open to see events
4. **Check logs:** Watch console output for errors and event publishing
5. **Use database client:** Connect to PostgreSQL to verify data changes

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production` in environment
- [ ] Use strong database credentials
- [ ] Enable HTTPS/TLS
- [ ] Add rate limiting
- [ ] Add authentication middleware
- [ ] Set up proper logging
- [ ] Configure monitoring and alerts
- [ ] Set up database backups
- [ ] Review and harden CORS settings
- [ ] Add input validation and sanitization
- [ ] Set up CI/CD pipeline
- [ ] Load test the service

## Useful Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start

# Run tests (when implemented)
npm test

# Check for issues
npm run lint

# Format code
npm run format
```

Happy coding! 🎉

