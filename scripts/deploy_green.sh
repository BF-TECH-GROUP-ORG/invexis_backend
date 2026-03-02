#!/bin/bash
# ==================================================================================
# GREEN DEPLOYMENT SCRIPT - INVEXIS PRODUCTION
# ==================================================================================
# This script handles the deployment of Green environment services for blue/green deployment
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
COMPOSE_FILE="$PROJECT_ROOT/deployments/docker/docker-compose.prod.yml"
ENV_FILE="$PROJECT_ROOT/deployments/secrets/envs/.env.prod"

# Default values
DEPLOY_TAG="${DEPLOY_TAG:-latest}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-localhost:5000}"
SERVICES_TO_DEPLOY="${SERVICES_TO_DEPLOY:-all}"
PARALLEL_LIMIT="${PARALLEL_LIMIT:-3}"
TRAFFIC_SWITCH="${TRAFFIC_SWITCH:-false}"

# Logging
LOG_FILE="/var/log/invexis/deploy-green-$(date +%Y%m%d-%H%M%S).log"
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
    log "🔍 Checking prerequisites for green deployment..."
    
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
    
    # Check if blue deployment is running (prerequisite for green)
    if ! docker ps --format "table {{.Names}}" | grep -q "invexis.*blue.*prod"; then
        warn "⚠️ No blue deployment found. Green deployment is typically used alongside blue."
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    log "✅ Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log "📋 Loading environment variables for green deployment..."
    
    # Source the environment file
    set -a
    source "$ENV_FILE"
    set +a
    
    # Set deployment-specific variables for green
    export DEPLOYMENT_COLOR=green
    export DEPLOY_TAG="$DEPLOY_TAG"
    export DOCKER_REGISTRY="$DOCKER_REGISTRY"
    
    log "✅ Environment loaded successfully for green deployment"
}

# Create green compose file
create_green_compose() {
    log "📝 Creating green deployment compose configuration..."
    
    local green_compose_file="/tmp/docker-compose.green.yml"
    
    # Create a modified compose file for green deployment
    sed 's/-blue:/-green:/g; s/-blue"/-green"/g; s/blue-prod/green-prod/g' "$COMPOSE_FILE" > "$green_compose_file"
    
    # Update environment variables for green services
    sed -i 's/DEPLOYMENT_COLOR=blue/DEPLOYMENT_COLOR=green/g' "$green_compose_file"
    
    # Use different ports to avoid conflicts with blue
    sed -i 's/traefik.enable=true/traefik.enable=false/g' "$green_compose_file"
    
    echo "$green_compose_file"
}

# Get list of green services to deploy
get_green_services_list() {
    local services_array=()
    
    if [[ "$SERVICES_TO_DEPLOY" == "all" ]]; then
        services_array=(
            "api-gateway-green"
            "auth-service-green"
            "company-service-green"
            "shop-service-green"
            "inventory-service-green"
            "sales-service-green"
            "ecommerce-service-green"
            "notification-service-green"
            "payment-service-green"
            "analytics-service-green"
            "audit-service-green"
            "debt-service-green"
            "websocket-service-green"
        )
    else
        IFS=',' read -ra ADDR <<< "$SERVICES_TO_DEPLOY"
        for service in "${ADDR[@]}"; do
            services_array+=("$(echo "$service" | tr -d ' ')-green")
        done
    fi
    
    echo "${services_array[@]}"
}

# Pull Docker images for green deployment
pull_green_images() {
    log "🐳 Pulling Docker images for green deployment..."
    
    local services=($(get_green_services_list))
    local failed_pulls=()
    
    for service in "${services[@]}"; do
        local image_name="${service%-green}"
        local full_image="$DOCKER_REGISTRY/invexis/$image_name:$DEPLOY_TAG"
        
        info "Pulling $full_image for green deployment..."
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
    
    log "✅ All green images pulled successfully"
}

# Deploy green services
deploy_green_services() {
    log "🚀 Deploying green services..."
    
    local green_compose_file=$(create_green_compose)
    local services=($(get_green_services_list))
    local deployed_services=()
    local failed_deployments=()
    
    # Deploy services in parallel batches
    local batch_size=$PARALLEL_LIMIT
    for ((i=0; i<${#services[@]}; i+=batch_size)); do
        local batch=("${services[@]:i:batch_size}")
        
        info "Deploying green batch: ${batch[*]}"
        
        # Start services in parallel
        for service in "${batch[@]}"; do
            (
                info "Starting green $service..."
                if docker-compose -f "$green_compose_file" up -d "$service"; then
                    log "✅ Green $service started successfully"
                    echo "$service" >> "/tmp/green_deployed_services.$$"
                else
                    error "❌ Failed to start green $service"
                    echo "$service" >> "/tmp/green_failed_deployments.$$"
                fi
            ) &
        done
        
        # Wait for batch to complete
        wait
        
        # Wait for services to stabilize
        sleep 20
    done
    
    # Collect results
    if [[ -f "/tmp/green_deployed_services.$$" ]]; then
        mapfile -t deployed_services < "/tmp/green_deployed_services.$$"
        rm -f "/tmp/green_deployed_services.$$"
    fi
    
    if [[ -f "/tmp/green_failed_deployments.$$" ]]; then
        mapfile -t failed_deployments < "/tmp/green_failed_deployments.$$"
        rm -f "/tmp/green_failed_deployments.$$"
    fi
    
    # Report results
    if [[ ${#deployed_services[@]} -gt 0 ]]; then
        log "✅ Successfully deployed green services: ${deployed_services[*]}"
    fi
    
    if [[ ${#failed_deployments[@]} -gt 0 ]]; then
        error "❌ Failed to deploy green services: ${failed_deployments[*]}"
        exit 1
    fi
    
    log "✅ All green services deployed successfully"
    
    # Cleanup temporary compose file
    rm -f "$green_compose_file"
}

# Health check for green services
green_health_check() {
    log "🏥 Running health checks for green services..."
    
    local services=($(get_green_services_list))
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
            log "✅ All green services are healthy"
            return 0
        fi
        
        info "⏳ Attempt $attempt/$max_attempts - Waiting for green services to become healthy: ${unhealthy_services[*]}"
        sleep 10
        ((attempt++))
    done
    
    error "❌ Green health check failed after $max_attempts attempts"
    error "Unhealthy green services: ${unhealthy_services[*]}"
    return 1
}

# Test green deployment
test_green_deployment() {
    log "🧪 Testing green deployment..."
    
    # Test API endpoints directly (bypassing load balancer)
    local services=($(get_green_services_list))
    local test_failures=()
    
    for service in "${services[@]}"; do
        local container_name="invexis-$service-prod"
        local service_name="${service%-green}"
        
        # Skip if container doesn't exist
        if ! docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            continue
        fi
        
        # Get service port
        local port
        case "$service_name" in
            "api-gateway") port=8000 ;;
            "auth-service") port=8001 ;;
            "analytics-service") port=8002 ;;
            "audit-service") port=8003 ;;
            "company-service") port=8004 ;;
            "debt-service") port=8005 ;;
            "ecommerce-service") port=8006 ;;
            "inventory-service") port=8007 ;;
            "notification-service") port=8008 ;;
            "payment-service") port=8009 ;;
            "sales-service") port=9000 ;;
            "shop-service") port=9001 ;;
            "websocket-service") port=9002 ;;
            *) port=8000 ;;
        esac
        
        # Test health endpoint
        info "Testing green $service_name on port $port..."
        if docker exec "$container_name" curl -f "http://localhost:$port/health" >/dev/null 2>&1; then
            log "✅ Green $service_name health check passed"
        else
            error "❌ Green $service_name health check failed"
            test_failures+=("$service_name")
        fi
        
        # Test metrics endpoint if available
        if docker exec "$container_name" curl -f "http://localhost:$port/metrics" >/dev/null 2>&1; then
            log "✅ Green $service_name metrics endpoint available"
        else
            warn "⚠️ Green $service_name metrics endpoint not available"
        fi
    done
    
    if [[ ${#test_failures[@]} -gt 0 ]]; then
        error "❌ Green deployment tests failed for: ${test_failures[*]}"
        return 1
    fi
    
    log "✅ Green deployment tests passed"
}

# Switch traffic to green (blue-green deployment)
switch_traffic_to_green() {
    if [[ "$TRAFFIC_SWITCH" != "true" ]]; then
        log "🔄 Traffic switch not requested (set TRAFFIC_SWITCH=true to enable)"
        return 0
    fi
    
    log "🔄 Switching traffic from blue to green..."
    
    # Update Traefik configuration to point to green services
    local traefik_config_file="$PROJECT_ROOT/deployments/traefik/dynamic_conf.yml"
    
    if [[ -f "$traefik_config_file" ]]; then
        # Backup current configuration
        cp "$traefik_config_file" "$traefik_config_file.backup.$(date +%Y%m%d-%H%M%S)"
        
        # Update configuration to point to green services
        sed -i 's/blue:8000/green:8000/g' "$traefik_config_file"
        sed -i 's/blue:9002/green:9002/g' "$traefik_config_file"
        
        # Reload Traefik configuration
        if docker exec invexis-traefik-prod kill -USR1 1; then
            log "✅ Traefik configuration reloaded"
        else
            error "❌ Failed to reload Traefik configuration"
            return 1
        fi
        
        # Wait for traffic switch to take effect
        sleep 10
        
        # Verify traffic switch
        if curl -f "https://api.${DOMAIN:-localhost}/health" >/dev/null 2>&1; then
            log "✅ Traffic successfully switched to green deployment"
        else
            error "❌ Traffic switch verification failed"
            return 1
        fi
    else
        warn "⚠️ Traefik configuration file not found, manual traffic switch required"
    fi
}

# Verify green deployment
verify_green_deployment() {
    log "✅ Verifying green deployment..."
    
    # Check service logs for errors
    local services=($(get_green_services_list))
    local services_with_errors=()
    
    for service in "${services[@]}"; do
        local container_name="invexis-$service-prod"
        
        # Skip if container doesn't exist
        if ! docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            continue
        fi
        
        # Check recent logs for errors
        if docker logs --since=5m "$container_name" 2>&1 | grep -qi "error\|exception\|fatal"; then
            services_with_errors+=("$service")
            warn "⚠️ Found errors in logs for green $service"
        fi
    done
    
    # Check resource usage
    info "Checking green services resource usage..."
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep "invexis.*green" || true
    
    if [[ ${#services_with_errors[@]} -gt 0 ]]; then
        warn "⚠️ Some green services have issues: ${services_with_errors[*]}"
        warn "Please check the logs and monitor the deployment"
    else
        log "✅ Green deployment verification completed successfully"
    fi
}

# Cleanup function
cleanup() {
    log "🧹 Cleaning up temporary files..."
    rm -f "/tmp/green_deployed_services.$$" "/tmp/green_failed_deployments.$$"
    rm -f "/tmp/docker-compose.green.yml"
}

# Rollback green deployment
rollback_green() {
    log "🔄 Rolling back green deployment..."
    
    local services=($(get_green_services_list))
    
    # Stop green services
    for service in "${services[@]}"; do
        local container_name="invexis-$service-prod"
        if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            info "Stopping green $service..."
            docker stop "$container_name" || true
        fi
    done
    
    # Remove green containers
    for service in "${services[@]}"; do
        local container_name="invexis-$service-prod"
        if docker ps -a --format "table {{.Names}}" | grep -q "$container_name"; then
            info "Removing green $service container..."
            docker rm "$container_name" || true
        fi
    done
    
    log "✅ Green deployment rolled back"
}

# Main deployment function
main() {
    log "🚀 Starting Green Deployment - Invexis Production"
    log "Deploy Tag: $DEPLOY_TAG"
    log "Services: $SERVICES_TO_DEPLOY"
    log "Traffic Switch: $TRAFFIC_SWITCH"
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Run deployment steps
    check_prerequisites
    load_environment
    pull_green_images
    deploy_green_services
    
    # Health checks with retry
    if ! green_health_check; then
        error "❌ Green deployment failed health checks"
        rollback_green
        exit 1
    fi
    
    # Test green deployment
    if ! test_green_deployment; then
        error "❌ Green deployment failed tests"
        rollback_green
        exit 1
    fi
    
    # Switch traffic if requested
    switch_traffic_to_green
    
    verify_green_deployment
    
    log "🎉 Green deployment completed successfully!"
    log "Deployment details:"
    log "  - Tag: $DEPLOY_TAG"
    log "  - Services: $(get_green_services_list)"
    log "  - Traffic Switched: $TRAFFIC_SWITCH"
    log "  - Log file: $LOG_FILE"
    
    # Send notification
    if command -v node >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/deployments/slack/notifications.config.js" ]]; then
        info "📢 Sending Slack notification..."
        node -e "
            const { slackNotifier } = require('$PROJECT_ROOT/deployments/slack/notifications.config.js');
            slackNotifier.deploymentSuccess({
                version: '$DEPLOY_TAG',
                environment: 'production-green',
                duration: 'deployment completed',
                servicesUpdated: '$(get_green_services_list)'.split(' ')
            }).catch(console.error);
        "
    fi
}

# Handle script arguments
case "${1:-}" in
    "--help"|"-h")
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Deploy Green environment for Invexis production (Blue/Green deployment)"
        echo ""
        echo "Environment Variables:"
        echo "  DEPLOY_TAG         Docker image tag to deploy (default: latest)"
        echo "  SERVICES_TO_DEPLOY Comma-separated list of services or 'all' (default: all)"
        echo "  DOCKER_REGISTRY    Docker registry URL (default: localhost:5000)"
        echo "  PARALLEL_LIMIT     Number of services to deploy in parallel (default: 3)"
        echo "  TRAFFIC_SWITCH     Whether to switch traffic to green (default: false)"
        echo ""
        echo "Options:"
        echo "  --rollback         Rollback green deployment"
        echo ""
        echo "Examples:"
        echo "  $0                                    # Deploy green services"
        echo "  DEPLOY_TAG=v1.2.3 TRAFFIC_SWITCH=true $0  # Deploy and switch traffic"
        echo "  $0 --rollback                        # Rollback green deployment"
        exit 0
        ;;
    "--rollback")
        log "🔄 Rolling back green deployment..."
        load_environment
        rollback_green
        exit 0
        ;;
    "")
        # Run main function
        main "$@"
        ;;
    *)
        error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac