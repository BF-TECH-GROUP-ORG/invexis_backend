#!/bin/bash
# ==================================================================================
# BLUE DEPLOYMENT SCRIPT - INVEXIS PRODUCTION
# ==================================================================================
# This script handles the deployment of Blue environment services
# ==================================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
ENV_FILE="$PROJECT_ROOT/deployments/secrets/envs/.env.prod"

# Default values
DEPLOY_TAG="${DEPLOY_TAG:-latest}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-localhost:5000}"
SERVICES_TO_DEPLOY="${SERVICES_TO_DEPLOY:-all}"
PARALLEL_LIMIT="${PARALLEL_LIMIT:-3}"

# Logging
LOG_FILE="/var/log/invexis/deploy-blue-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "🔍 Checking prerequisites..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running"
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose >/dev/null 2>&1; then
        error "docker-compose is not installed"
        exit 1
    fi
    
    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file not found: $ENV_FILE"
        exit 1
    fi
    
    # Check if compose file exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        error "Docker compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    log "✅ Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log "📋 Loading environment variables..."
    
    # Source the environment file
    set -a
    source "$ENV_FILE"
    set +a
    
    # Set deployment-specific variables
    export DEPLOYMENT_COLOR=blue
    export DEPLOY_TAG="$DEPLOY_TAG"
    export DOCKER_REGISTRY="$DOCKER_REGISTRY"
    
    log "✅ Environment loaded successfully"
}

# Get list of services to deploy
get_services_list() {
    local services_array=()
    
    if [[ "$SERVICES_TO_DEPLOY" == "all" ]]; then
        services_array=(
            "api-gateway-blue"
            "auth-service-blue"
            "company-service-blue"
            "shop-service-blue"
            "inventory-service-blue"
            "sales-service-blue"
            "notification-service-blue"
            "payment-service-blue"
            "analytics-service-blue"
            "audit-service-blue"
            "debt-service-blue"
            "websocket-service-blue"
            "report-service-blue"
            "document-service-blue"
        )
    else
        IFS=',' read -ra ADDR <<< "$SERVICES_TO_DEPLOY"
        for service in "${ADDR[@]}"; do
            services_array+=("$(echo "$service" | tr -d ' ')-blue")
        done
    fi
    
    echo "${services_array[@]}"
}

# Pull Docker images
pull_images() {
    log "🐳 Pulling Docker images for blue deployment..."
    
    local services=($(get_services_list))
    local failed_pulls=()
    
    for service in "${services[@]}"; do
        local image_name="${service%-blue}"
        local full_image="$DOCKER_REGISTRY/invexis/$image_name:$DEPLOY_TAG"
        
        info "Pulling $full_image..."
        if docker pull "$full_image"; then
            log "✅ Successfully pulled $full_image"
        else
            error "❌ Failed to pull $full_image"
            failed_pulls+=("$full_image")
        fi
    done
    
    if [[ ${#failed_pulls[@]} -gt 0 ]]; then
        error "Failed to pull the following images:"
        printf '  %s\n' "${failed_pulls[@]}"
        exit 1
    fi
    
    log "✅ All images pulled successfully"
}

# Helper: Wait for a container to be healthy
wait_for_healthy() {
    local service=$1
    local max_attempts=30
    local attempt=1
    
    info "⏳ Waiting for $service to be healthy..."
    
    while [[ $attempt -le $max_attempts ]]; do
        local status=$(docker inspect --format='{{.State.Health.Status}}' "invexis-$service-prod" 2>/dev/null || echo "none")
        
        if [[ "$status" == "healthy" ]]; then
            log "✅ $service is healthy"
            return 0
        fi
        
        # Fallback for services without healthcheck
        if [[ "$status" == "none" ]]; then
            if docker ps --format '{{.Names}}' | grep -q "invexis-$service-prod"; then
                log "✅ $service is running (no healthcheck defined)"
                return 0
            fi
        fi
        
        echo -ne "   Attempt $attempt/$max_attempts... \r"
        sleep 2
        ((attempt++))
    done
    
    error "❌ $service failed to become healthy after $max_attempts attempts"
    return 1
}

# Check database connectivity
check_databases() {
    log "🗄️ Checking and waiting for infrastructure..."
    
    # 1. Start core infra if not running
    info "Ensuring core infrastructure containers are up..."
    docker-compose -f "$COMPOSE_FILE" up -d \
        company-postgres shop-postgres payment-postgres analytics-postgres \
        sales-mysql mongodb redis rabbitmq
    
    # 2. Wait for each to be healthy
    local infra_services=("company-postgres" "shop-postgres" "payment-postgres" "analytics-postgres" "sales-mysql" "mongodb" "redis" "rabbitmq")
    
    for service in "${infra_services[@]}"; do
        if ! wait_for_healthy "$service"; then
            error "Infrastructure failure: $service is not healthy."
            exit 1
        fi
    done
    
    log "✅ All infrastructure components are verified healthy"
}

# Deploy blue services
deploy_blue_services() {
    log "🚀 Deploying blue services..."
    
    local services=($(get_services_list))
    local deployed_services=()
    local failed_deployments=()
    
    # Deploy services in parallel batches
    local batch_size=$PARALLEL_LIMIT
    for ((i=0; i<${#services[@]}; i+=batch_size)); do
        local batch=("${services[@]:i:batch_size}")
        
        info "Deploying batch: ${batch[*]}"
        
        # Start services in parallel
        for service in "${batch[@]}"; do
            (
                info "Starting $service..."
                if docker-compose -f "$COMPOSE_FILE" up -d "$service"; then
                    log "✅ $service started successfully"
                    echo "$service" >> "/tmp/deployed_services.$$"
                else
                    error "❌ Failed to start $service"
                    echo "$service" >> "/tmp/failed_deployments.$$"
                fi
            ) &
        done
        
        # Wait for batch to complete
        wait
        
        # Wait for services to stabilize
        sleep 15
    done
    
    # Collect results
    if [[ -f "/tmp/deployed_services.$$" ]]; then
        mapfile -t deployed_services < "/tmp/deployed_services.$$"
        rm -f "/tmp/deployed_services.$$"
    fi
    
    if [[ -f "/tmp/failed_deployments.$$" ]]; then
        mapfile -t failed_deployments < "/tmp/failed_deployments.$$"
        rm -f "/tmp/failed_deployments.$$"
    fi
    
    # Report results
    if [[ ${#deployed_services[@]} -gt 0 ]]; then
        log "✅ Successfully deployed: ${deployed_services[*]}"
    fi
    
    if [[ ${#failed_deployments[@]} -gt 0 ]]; then
        error "❌ Failed to deploy: ${failed_deployments[*]}"
        exit 1
    fi
    
    log "✅ All blue services deployed successfully"
}

# Health check for deployed services
health_check() {
    log "🏥 Running health checks for blue services..."
    
    local services=($(get_services_list))
    local max_attempts=30
    local attempt=1
    local unhealthy_services=()
    
    while [[ $attempt -le $max_attempts ]]; do
        unhealthy_services=()
        
        for service in "${services[@]}"; do
            local container_name="invexis-$service-prod"
            
            # Check if container is running
            if ! docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
                unhealthy_services+=("$service (not running)")
                continue
            fi
            
            # Check container health status
            local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")
            
            if [[ "$health_status" == "healthy" ]]; then
                continue
            elif [[ "$health_status" == "none" ]]; then
                # No health check defined, check if container is running
                local container_status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "not found")
                if [[ "$container_status" != "running" ]]; then
                    unhealthy_services+=("$service (not running)")
                fi
            else
                unhealthy_services+=("$service ($health_status)")
            fi
        done
        
        if [[ ${#unhealthy_services[@]} -eq 0 ]]; then
            log "✅ All blue services are healthy"
            return 0
        fi
        
        info "⏳ Attempt $attempt/$max_attempts - Waiting for services to become healthy: ${unhealthy_services[*]}"
        sleep 10
        ((attempt++))
    done
    
    error "❌ Health check failed after $max_attempts attempts"
    error "Unhealthy services: ${unhealthy_services[*]}"
    return 1
}

# Verify deployment
verify_deployment() {
    log "✅ Verifying blue deployment..."
    
    # Check service logs for errors
    local services=($(get_services_list))
    local services_with_errors=()
    
    for service in "${services[@]}"; do
        local container_name="invexis-$service-prod"
        
        # Check recent logs for errors
        if docker logs --since=5m "$container_name" 2>&1 | grep -qi "error\|exception\|fatal"; then
            services_with_errors+=("$service")
            warn "⚠️ Found errors in logs for $service"
        fi
    done
    
    # Check resource usage
    info "Checking resource usage..."
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep "invexis.*blue"
    
    # Test API endpoints (if API Gateway is deployed)
    if [[ " ${services[*]} " =~ " api-gateway-blue " ]]; then
        info "Testing API endpoints..."
        local api_container="invexis-api-gateway-blue-prod"
        
        # Test health endpoint
        if docker exec "$api_container" curl -f http://localhost:8000/health >/dev/null 2>&1; then
            log "✅ API Gateway health check passed"
        else
            warn "⚠️ API Gateway health check failed"
            services_with_errors+=("api-gateway-blue")
        fi
    fi
    
    if [[ ${#services_with_errors[@]} -gt 0 ]]; then
        warn "⚠️ Some services have issues: ${services_with_errors[*]}"
        warn "Please check the logs and monitor the deployment"
    else
        log "✅ Blue deployment verification completed successfully"
    fi
}

# Cleanup function
cleanup() {
    log "🧹 Cleaning up temporary files..."
    rm -f "/tmp/deployed_services.$$" "/tmp/failed_deployments.$$"
}

# Main deployment function
main() {
    log "🚀 Starting Blue Deployment - Invexis Production"
    log "Deploy Tag: $DEPLOY_TAG"
    log "Services: $SERVICES_TO_DEPLOY"
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Run deployment steps
    check_prerequisites
    load_environment
    pull_images
    check_databases
    deploy_blue_services
    
    # Health checks with retry
    if ! health_check; then
        error "❌ Blue deployment failed health checks"
        exit 1
    fi
    
    verify_deployment
    
    log "🎉 Blue deployment completed successfully!"
    log "Deployment details:"
    log "  - Tag: $DEPLOY_TAG"
    log "  - Services: $(get_services_list)"
    log "  - Log file: $LOG_FILE"
    
    # Send notification
    if command -v node >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/deployments/slack/notifications.config.js" ]]; then
        info "📢 Sending Slack notification..."
        node -e "
            const { slackNotifier } = require('$PROJECT_ROOT/deployments/slack/notifications.config.js');
            slackNotifier.deploymentSuccess({
                version: '$DEPLOY_TAG',
                environment: 'production-blue',
                duration: 'deployment completed',
                servicesUpdated: '$(get_services_list)'.split(' ')
            }).catch(console.error);
        "
    fi
}

# Handle script arguments
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Deploy Blue environment for Invexis production"
    echo ""
    echo "Environment Variables:"
    echo "  DEPLOY_TAG         Docker image tag to deploy (default: latest)"
    echo "  SERVICES_TO_DEPLOY Comma-separated list of services or 'all' (default: all)"
    echo "  DOCKER_REGISTRY    Docker registry URL (default: localhost:5000)"
    echo "  PARALLEL_LIMIT     Number of services to deploy in parallel (default: 3)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy all services"
    echo "  DEPLOY_TAG=v1.2.3 $0                # Deploy specific version"
    echo "  SERVICES_TO_DEPLOY=api-gateway,auth-service $0  # Deploy specific services"
    exit 0
fi

# Run main function
main "$@"