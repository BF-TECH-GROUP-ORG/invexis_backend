#!/bin/bash
# ==================================================================================
# PRODUCTION BUILD SCRIPT - INVEXIS
# ==================================================================================
# This script builds all 15 microservices from source on the local server.
# Run this after cloning/pulling code to prepare images for the deployment cluster.
# ==================================================================================

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
TAG="${1:-latest}"
REGISTRY="${DOCKER_REGISTRY:-localhost:5000}" # Matches docker-compose.prod.yml default namespace

SERVICES=(
    "api-gateway"
    "auth-service"
    "company-service"
    "shop-service"
    "inventory-service"
    "sales-service"
    "notification-service"
    "payment-service"
    "analytics-service"
    "audit-service"
    "debt-service"
    "websocket-service"
    "report-service"
    "document-service"
)

echo -e "${BLUE}🏗️ Starting Industrial Production Build (Tag: $TAG)${NC}"

for service in "${SERVICES[@]}"; do
    echo -e "${BLUE}🔨 Building $service...${NC}"
    
    # Build the image using the service's Dockerfile
    if docker build -t "$REGISTRY/invexis/$service:$TAG" "./services/$service"; then
        echo -e "${GREEN}✅ Successfully built $REGISTRY/invexis/$service:$TAG${NC}"
    else
        echo -e "${RED}❌ Failed to build $service${NC}"
        exit 1
    fi
done

echo -e "${GREEN}🎉 All services built and tagged successfully!${NC}"
echo -e "${BLUE}You can now run: ./scripts/deploy_blue.sh${NC}"
