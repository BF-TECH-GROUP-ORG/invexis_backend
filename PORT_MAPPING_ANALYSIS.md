# Port Mapping Analysis - Invexis Backend

## Summary of Port Mismatches

This document identifies discrepancies between Traefik loadbalancer ports, Docker healthcheck ports, service code ports, and Dockerfile EXPOSE ports.

## Port Mapping Table

| Service | Traefik Port | Healthcheck Port | Code Default | Dockerfile EXPOSE | Status | Required Port |
|---------|--------------|------------------|--------------|-------------------|--------|---------------|
| api-gateway | 8000 | 4000 | 3000 | 8000 | ❌ MISMATCH | **8000** |
| auth-service | 8001 | 3001 | 3001 | 8001 | ❌ MISMATCH | **8001** |
| company-service | 8002 | 3002 | 8004 | N/A | ❌ MISMATCH | **8002** |
| shop-service | 8003 | 4009 | 4009 | 4009 | ❌ MISMATCH | **8003** |
| inventory-service | 8004 | 3003 | N/A | 8007 | ❌ MISMATCH | **8004** |
| sales-service | 8005 | 3005 | 3005 | 3005 | ❌ MISMATCH | **8005** |
| payment-service | 8006 | 8009 | 8009 | 8009 | ❌ MISMATCH | **8006** |
| ecommerce-service | 8007 | 3007 | N/A | N/A | ❌ MISMATCH | **8007** |
| notification-service | 8008 | 3008 | N/A | 8008 | ❌ MISMATCH | **8008** |
| analytics-service | 8009 | 3009 | N/A | 8002 | ❌ MISMATCH | **8009** |
| audit-service | 8010 | 3010 | 3000 | 8003 | ❌ MISMATCH | **8010** |
| debt-service | 8011 | 3011 | N/A | N/A | ❌ MISMATCH | **8011** |
| websocket-service | 8012 | 3004 | N/A | 9009 | ❌ MISMATCH | **8012** |

## Detailed Analysis

### 1. api-gateway
- **Traefik expects:** 8000
- **Healthcheck checks:** 4000
- **Code listens on:** 3000 (default)
- **Dockerfile exposes:** 8000
- **Action:** Update code to use 8000, update healthcheck to 8000

### 2. auth-service
- **Traefik expects:** 8001
- **Healthcheck checks:** 3001
- **Code listens on:** 3001 (default)
- **Dockerfile exposes:** 8001
- **Action:** Update code to use 8001, update healthcheck to 8001

### 3. company-service
- **Traefik expects:** 8002
- **Healthcheck checks:** 3002
- **Code listens on:** 8004 (default)
- **Dockerfile:** Not created yet
- **Action:** Update code to use 8002, update healthcheck to 8002, update .env.example

### 4. shop-service
- **Traefik expects:** 8003
- **Healthcheck checks:** 4009
- **Code listens on:** 4009 (default)
- **Dockerfile exposes:** 4009
- **Action:** Update code to use 8003, update healthcheck to 8003, update Dockerfile

### 5. inventory-service
- **Traefik expects:** 8004
- **Healthcheck checks:** 3003
- **Code listens on:** Unknown
- **Dockerfile exposes:** 8007
- **Action:** Update code to use 8004, update healthcheck to 8004, update Dockerfile

### 6. sales-service
- **Traefik expects:** 8005
- **Healthcheck checks:** 3005
- **Code listens on:** 3005 (default)
- **Dockerfile exposes:** 3005
- **Action:** Update code to use 8005, update healthcheck to 8005, update Dockerfile

### 7. payment-service
- **Traefik expects:** 8006
- **Healthcheck checks:** 8009
- **Code listens on:** 8009 (default)
- **Dockerfile exposes:** 8009
- **Action:** Update code to use 8006, update healthcheck to 8006, update Dockerfile

### 8. ecommerce-service
- **Traefik expects:** 8007
- **Healthcheck checks:** 3007
- **Code listens on:** Unknown
- **Dockerfile:** Not found
- **Action:** Update code to use 8007, update healthcheck to 8007

### 9. notification-service
- **Traefik expects:** 8008
- **Healthcheck checks:** 3008
- **Code listens on:** Unknown
- **Dockerfile exposes:** 8008
- **Action:** Update code to use 8008, update healthcheck to 8008

### 10. analytics-service
- **Traefik expects:** 8009
- **Healthcheck checks:** 3009
- **Code listens on:** Unknown
- **Dockerfile exposes:** 8002
- **Action:** Update code to use 8009, update healthcheck to 8009, update Dockerfile

### 11. audit-service
- **Traefik expects:** 8010
- **Healthcheck checks:** 3010
- **Code listens on:** 3000 (default)
- **Dockerfile exposes:** 8003
- **Action:** Update code to use 8010, update healthcheck to 8010, update Dockerfile

### 12. debt-service
- **Traefik expects:** 8011
- **Healthcheck checks:** 3011
- **Code listens on:** Unknown
- **Dockerfile:** Not found
- **Action:** Update code to use 8011, update healthcheck to 8011

### 13. websocket-service
- **Traefik expects:** 8012
- **Healthcheck checks:** 3004
- **Code listens on:** Unknown
- **Dockerfile exposes:** 9009
- **Action:** Update code to use 8012, update healthcheck to 8012, update Dockerfile

## Standardized Port Scheme

**All services should use ports 8000-8012 as defined by Traefik labels:**

```
8000 - api-gateway
8001 - auth-service
8002 - company-service
8003 - shop-service
8004 - inventory-service
8005 - sales-service
8006 - payment-service
8007 - ecommerce-service
8008 - notification-service
8009 - analytics-service
8010 - audit-service
8011 - debt-service
8012 - websocket-service
```

## Files to Update

For each service, update:
1. `src/index.js` - Change PORT default value
2. `Dockerfile` - Change EXPOSE port
3. `docker-compose.yml` - Update healthcheck port
4. `.env.example` (if exists) - Update PORT value
5. `api-gateway/config/services.js` - Update service URLs

## Priority

**HIGH PRIORITY** - These services are actively used:
- api-gateway
- auth-service
- company-service
- shop-service
- payment-service
- sales-service

**MEDIUM PRIORITY** - These services exist but may not be fully implemented:
- inventory-service
- notification-service
- analytics-service
- audit-service
- websocket-service

**LOW PRIORITY** - These services may not be implemented yet:
- ecommerce-service
- debt-service

