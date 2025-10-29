# 🚀 Invexis Backend - Ports Quick Reference

## Service Ports (Standardized)

```
┌─────────────────────────┬──────┬────────────────────────────────┐
│ Service                 │ Port │ URL                            │
├─────────────────────────┼──────┼────────────────────────────────┤
│ API Gateway             │ 8000 │ http://localhost:8000          │
│ Auth Service            │ 8001 │ http://localhost:8001          │
│ Company Service         │ 8002 │ http://localhost:8002          │
│ Shop Service            │ 8003 │ http://localhost:8003          │
│ Inventory Service       │ 8004 │ http://localhost:8004          │
│ Sales Service           │ 8005 │ http://localhost:8005          │
│ Payment Service         │ 8006 │ http://localhost:8006          │
│ E-commerce Service      │ 8007 │ http://localhost:8007          │
│ Notification Service    │ 8008 │ http://localhost:8008          │
│ Analytics Service       │ 8009 │ http://localhost:8009          │
│ Audit Service           │ 8010 │ http://localhost:8010          │
│ Debt Service            │ 8011 │ http://localhost:8011          │
│ WebSocket Service       │ 8012 │ http://localhost:8012          │
└─────────────────────────┴──────┴────────────────────────────────┘
```

## Infrastructure Ports

```
┌─────────────────────────┬──────┬────────────────────────────────┐
│ Service                 │ Port │ Purpose                        │
├─────────────────────────┼──────┼────────────────────────────────┤
│ Traefik (HTTP)          │   80 │ Reverse proxy entry            │
│ Traefik (HTTPS)         │  443 │ Secure reverse proxy           │
│ Traefik Dashboard       │ 8080 │ Traefik web UI                 │
│ PostgreSQL (Company)    │ 5432 │ Company DB                     │
│ PostgreSQL (Shop)       │ 5435 │ Shop DB                        │
│ PostgreSQL (Payment)    │ 5433 │ Payment DB                     │
│ PostgreSQL (Analytics)  │ 5434 │ Analytics DB                   │
│ MySQL (Sales)           │ 3306 │ Sales DB                       │
│ MongoDB                 │27017 │ Document DB                    │
│ Redis                   │ 6379 │ Cache & Sessions               │
│ RabbitMQ (AMQP)         │ 5672 │ Message broker                 │
│ RabbitMQ (Management)   │15672 │ RabbitMQ web UI                │
└─────────────────────────┴──────┴────────────────────────────────┘
```

## Traefik Routing

```
┌─────────────────────────┬────────────────────────────────────┐
│ Service                 │ Traefik Host                       │
├─────────────────────────┼────────────────────────────────────┤
│ API Gateway             │ api-gateway.local                  │
│ Auth Service            │ auth.local                         │
│ Company Service         │ company.local                      │
│ Shop Service            │ shop.local                         │
│ Inventory Service       │ inventory.local                    │
│ Sales Service           │ sales.local                        │
│ Payment Service         │ payment.local                      │
│ E-commerce Service      │ ecommerce.local                    │
│ Notification Service    │ notification.local                 │
│ Analytics Service       │ analytics.local                    │
│ Audit Service           │ audit.local                        │
│ Debt Service            │ debt.local                         │
│ WebSocket Service       │ websocket.local                    │
└─────────────────────────┴────────────────────────────────────┘
```

## API Gateway Routes

Access services through the API Gateway:

```
http://localhost:8000/auth/*          → auth-service:8001
http://localhost:8000/company/*       → company-service:8002
http://localhost:8000/shop/*          → shop-service:8003
http://localhost:8000/inventory/*     → inventory-service:8004
http://localhost:8000/sales/*         → sales-service:8005
http://localhost:8000/payment/*       → payment-service:8006
http://localhost:8000/ecommerce/*     → ecommerce-service:8007
http://localhost:8000/notification/*  → notification-service:8008
http://localhost:8000/analytics/*     → analytics-service:8009
http://localhost:8000/audit/*         → audit-service:8010
http://localhost:8000/debt/*          → debt-service:8011
http://localhost:8000/websocket/*     → websocket-service:8012
```

## Health Check Endpoints

All services expose a `/health` endpoint:

```bash
# Direct access
curl http://localhost:8000/health  # API Gateway
curl http://localhost:8001/health  # Auth Service
curl http://localhost:8002/health  # Company Service
# ... etc

# Through API Gateway
curl http://localhost:8000/auth/health
curl http://localhost:8000/company/health
curl http://localhost:8000/shop/health
# ... etc

# Through Traefik
curl -H "Host: api-gateway.local" http://localhost/health
curl -H "Host: auth.local" http://localhost/health
curl -H "Host: company.local" http://localhost/health
# ... etc
```

## Docker Container Names

```
invexis-api-gateway
invexis-auth-service
invexis-company-service
invexis-shop-service
invexis-inventory-service
invexis-sales-service
invexis-payment-service
invexis-ecommerce-service
invexis-notification-service
invexis-analytics-service
invexis-audit-service
invexis-debt-service
invexis-websocket-service
invexis-traefik
invexis-company-postgres
invexis-shop-postgres
invexis-payment-postgres
invexis-analytics-postgres
invexis-sales-mysql
invexis-redis
invexis-rabbitmq
mongodb
```

## Quick Commands

### Check all service health
```bash
for port in {8000..8012}; do
  echo "Port $port: $(curl -s http://localhost:$port/health || echo 'FAIL')"
done
```

### View all running services
```bash
docker-compose ps
```

### View logs for a specific service
```bash
docker-compose logs -f company-service
docker-compose logs -f api-gateway
```

### Restart a specific service
```bash
docker-compose restart company-service
```

### Rebuild and restart all services
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Access RabbitMQ Management UI
```
http://localhost:15672
Username: invexis
Password: invexispass
```

### Access Traefik Dashboard
```
http://localhost:8080
```

## Environment Variables

Override default ports using environment variables:

```bash
# In .env file or docker-compose.yml
PORT=8002  # For company-service
PORT=8001  # For auth-service
# etc.
```

## Network

All services run on the `invexis-network` Docker bridge network, allowing them to communicate using service names:

```
auth-service:8001
company-service:8002
shop-service:8003
# etc.
```

## Port Allocation Strategy

- **8000**: API Gateway (main entry point)
- **8001-8012**: Microservices (current)
- **8013-8099**: Reserved for future microservices
- **9000+**: Utility services, monitoring, etc.

## Notes

- All ports are configurable via environment variables
- Services communicate internally using Docker network
- External access is through Traefik (ports 80/443) or direct ports
- Healthchecks run every 15 seconds with 3 retries
- All services have a 30-second startup grace period

---

**Last Updated**: 2025-10-15  
**Version**: 1.0  
**Status**: ✅ Standardized

