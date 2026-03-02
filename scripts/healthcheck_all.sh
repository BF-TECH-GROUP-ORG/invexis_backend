#!/bin/bash
# ==================================================================================
# HEALTH CHECK SCRIPT - INVEXIS PRODUCTION
# ==================================================================================
# This script performs comprehensive health checks on all Invexis services
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
ENV_FILE="$PROJECT_ROOT/deployments/secrets/envs/.env.prod"

# Default values
DEPLOYMENT_COLOR="${1:-blue}"  # blue, green, or all
TIMEOUT="${TIMEOUT:-30}"
VERBOSE="${VERBOSE:-false}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-console}"  # console, json, prometheus

# Health check results
declare -A HEALTH_RESULTS
declare -A SERVICE_PORTS
OVERALL_STATUS="healthy"

# Service port mapping
SERVICE_PORTS=(
    ["api-gateway"]=8000
    ["auth-service"]=8001
    ["analytics-service"]=8002
    ["audit-service"]=8003
    ["company-service"]=8004
    ["debt-service"]=8005
    ["ecommerce-service"]=8006
    ["inventory-service"]=8007
    ["notification-service"]=8008
    ["payment-service"]=8009
    ["sales-service"]=9000
    ["shop-service"]=9001
    ["websocket-service"]=9002
)

# Functions
log() {
    if [[ "$OUTPUT_FORMAT" == "console" ]]; then
        echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
    fi
}

warn() {
    if [[ "$OUTPUT_FORMAT" == "console" ]]; then
        echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"
    fi
}

error() {
    if [[ "$OUTPUT_FORMAT" == "console" ]]; then
        echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"
    fi
}

info() {
    if [[ "$OUTPUT_FORMAT" == "console" && "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[$(date +'%H:%M:%S')] INFO:${NC} $1"
    fi
}

# Load environment variables
load_environment() {
    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
        info "Environment loaded successfully"
    else
        warn "Environment file not found: $ENV_FILE"
    fi
}

# Get list of services to check
get_services_to_check() {
    local services=()
    
    case "$DEPLOYMENT_COLOR" in
        "blue")
            for service in "${!SERVICE_PORTS[@]}"; do
                services+=("$service-blue")
            done
            ;;
        "green")
            for service in "${!SERVICE_PORTS[@]}"; do
                services+=("$service-green")
            done
            ;;
        "all")
            for service in "${!SERVICE_PORTS[@]}"; do
                # Check if blue container exists
                if docker ps -a --format "{{.Names}}" | grep -q "invexis-$service-blue-prod"; then
                    services+=("$service-blue")
                fi
                # Check if green container exists
                if docker ps -a --format "{{.Names}}" | grep -q "invexis-$service-green-prod"; then
                    services+=("$service-green")
                fi
            done
            ;;
        *)
            error "Invalid deployment color: $DEPLOYMENT_COLOR"
            exit 1
            ;;
    esac
    
    echo "${services[@]}"
}

# Check Docker container status
check_container_status() {
    local service="$1"
    local container_name="invexis-$service-prod"
    
    info "Checking container status for $service..."
    
    # Check if container exists
    if ! docker ps -a --format "{{.Names}}" | grep -q "^$container_name$"; then
        HEALTH_RESULTS["$service:container"]="not_found"
        return 1
    fi
    
    # Check if container is running
    local status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null)
    if [[ "$status" != "running" ]]; then
        HEALTH_RESULTS["$service:container"]="$status"
        return 1
    fi
    
    HEALTH_RESULTS["$service:container"]="running"
    return 0
}

# Check container health
check_container_health() {
    local service="$1"
    local container_name="invexis-$service-prod"
    
    info "Checking container health for $service..."
    
    # Get health status
    local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")
    
    if [[ "$health_status" == "healthy" ]]; then
        HEALTH_RESULTS["$service:health"]="healthy"
        return 0
    elif [[ "$health_status" == "none" ]]; then
        # No health check defined, consider healthy if running
        HEALTH_RESULTS["$service:health"]="no_healthcheck"
        return 0
    else
        HEALTH_RESULTS["$service:health"]="$health_status"
        return 1
    fi
}

# Check service HTTP endpoints
check_http_endpoints() {
    local service="$1"
    local container_name="invexis-$service-prod"
    local base_service="${service%-blue}"
    base_service="${base_service%-green}"
    
    info "Checking HTTP endpoints for $service..."
    
    # Get service port
    local port="${SERVICE_PORTS[$base_service]:-8000}"
    
    # Check health endpoint
    local health_response
    if health_response=$(docker exec "$container_name" curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/health" 2>/dev/null); then
        if [[ "$health_response" == "200" ]]; then
            HEALTH_RESULTS["$service:health_endpoint"]="ok"
        else
            HEALTH_RESULTS["$service:health_endpoint"]="http_$health_response"
            return 1
        fi
    else
        HEALTH_RESULTS["$service:health_endpoint"]="unreachable"
        return 1
    fi
    
    # Check metrics endpoint (optional)
    local metrics_response
    if metrics_response=$(docker exec "$container_name" curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/metrics" 2>/dev/null); then
        if [[ "$metrics_response" == "200" ]]; then
            HEALTH_RESULTS["$service:metrics_endpoint"]="ok"
        else
            HEALTH_RESULTS["$service:metrics_endpoint"]="http_$metrics_response"
        fi
    else
        HEALTH_RESULTS["$service:metrics_endpoint"]="unreachable"
    fi
    
    return 0
}

# Check service logs for errors
check_service_logs() {
    local service="$1"
    local container_name="invexis-$service-prod"
    
    info "Checking recent logs for $service..."
    
    # Check for errors in last 5 minutes
    local error_count
    error_count=$(docker logs --since=5m "$container_name" 2>&1 | grep -ci "error\|exception\|fatal" || echo "0")
    
    if [[ "$error_count" -eq 0 ]]; then
        HEALTH_RESULTS["$service:logs"]="clean"
    elif [[ "$error_count" -lt 5 ]]; then
        HEALTH_RESULTS["$service:logs"]="few_errors:$error_count"
        warn "Found $error_count errors in logs for $service"
    else
        HEALTH_RESULTS["$service:logs"]="many_errors:$error_count"
        error "Found $error_count errors in logs for $service"
        return 1
    fi
    
    return 0
}

# Check resource usage
check_resource_usage() {
    local service="$1"
    local container_name="invexis-$service-prod"
    
    info "Checking resource usage for $service..."
    
    # Get container stats
    local stats
    if stats=$(docker stats --no-stream --format "{{.CPUPerc}},{{.MemPerc}}" "$container_name" 2>/dev/null); then
        local cpu_percent="${stats%%,*}"
        local mem_percent="${stats##*,}"
        
        # Remove % symbol
        cpu_percent="${cpu_percent%\%}"
        mem_percent="${mem_percent%\%}"
        
        # Check CPU usage
        if (( $(echo "$cpu_percent > 80" | bc -l) )); then
            HEALTH_RESULTS["$service:cpu_usage"]="high:${cpu_percent}%"
            warn "High CPU usage for $service: ${cpu_percent}%"
        else
            HEALTH_RESULTS["$service:cpu_usage"]="normal:${cpu_percent}%"
        fi
        
        # Check memory usage
        if (( $(echo "$mem_percent > 85" | bc -l) )); then
            HEALTH_RESULTS["$service:memory_usage"]="high:${mem_percent}%"
            warn "High memory usage for $service: ${mem_percent}%"
        else
            HEALTH_RESULTS["$service:memory_usage"]="normal:${mem_percent}%"
        fi
    else
        HEALTH_RESULTS["$service:cpu_usage"]="unknown"
        HEALTH_RESULTS["$service:memory_usage"]="unknown"
        return 1
    fi
    
    return 0
}

# Check database connectivity
check_database_connectivity() {
    info "Checking database connectivity..."
    
    # PostgreSQL databases
    local postgres_dbs=("company-postgres" "shop-postgres" "payment-postgres" "analytics-postgres")
    for db in "${postgres_dbs[@]}"; do
        local container_name="invexis-$db-prod"
        if docker exec "$container_name" pg_isready -U invexis >/dev/null 2>&1; then
            HEALTH_RESULTS["database:$db"]="connected"
        else
            HEALTH_RESULTS["database:$db"]="disconnected"
            error "Database $db is not responding"
            OVERALL_STATUS="unhealthy"
        fi
    done
    
    # MySQL
    if docker exec "invexis-sales-mysql-prod" mysqladmin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD:-}" >/dev/null 2>&1; then
        HEALTH_RESULTS["database:sales-mysql"]="connected"
    else
        HEALTH_RESULTS["database:sales-mysql"]="disconnected"
        error "MySQL database is not responding"
        OVERALL_STATUS="unhealthy"
    fi
    
    # MongoDB
    if docker exec "invexis-mongodb-prod" mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        HEALTH_RESULTS["database:mongodb"]="connected"
    else
        HEALTH_RESULTS["database:mongodb"]="disconnected"
        error "MongoDB is not responding"
        OVERALL_STATUS="unhealthy"
    fi
    
    # Redis
    if docker exec "invexis-redis-prod" redis-cli -a "${REDIS_PASSWORD:-}" ping >/dev/null 2>&1; then
        HEALTH_RESULTS["database:redis"]="connected"
    else
        HEALTH_RESULTS["database:redis"]="disconnected"
        error "Redis is not responding"
        OVERALL_STATUS="unhealthy"
    fi
    
    # RabbitMQ
    if docker exec "invexis-rabbitmq-prod" rabbitmq-diagnostics -q ping >/dev/null 2>&1; then
        HEALTH_RESULTS["messaging:rabbitmq"]="connected"
    else
        HEALTH_RESULTS["messaging:rabbitmq"]="disconnected"
        error "RabbitMQ is not responding"
        OVERALL_STATUS="unhealthy"
    fi
}

# Check infrastructure services
check_infrastructure() {
    info "Checking infrastructure services..."
    
    # Traefik
    if docker exec "invexis-traefik-prod" traefik healthcheck >/dev/null 2>&1; then
        HEALTH_RESULTS["infrastructure:traefik"]="healthy"
    else
        HEALTH_RESULTS["infrastructure:traefik"]="unhealthy"
        warn "Traefik health check failed"
    fi
    
    # Prometheus
    if docker exec "invexis-prometheus-prod" wget --spider -q http://localhost:9090/-/healthy; then
        HEALTH_RESULTS["infrastructure:prometheus"]="healthy"
    else
        HEALTH_RESULTS["infrastructure:prometheus"]="unhealthy"
        warn "Prometheus health check failed"
    fi
    
    # Grafana
    if docker exec "invexis-grafana-prod" wget --spider -q http://localhost:3000/api/health; then
        HEALTH_RESULTS["infrastructure:grafana"]="healthy"
    else
        HEALTH_RESULTS["infrastructure:grafana"]="unhealthy"
        warn "Grafana health check failed"
    fi
    
    # Elasticsearch
    if curl -s "http://localhost:9200/_cluster/health" | grep -q "green\|yellow"; then
        HEALTH_RESULTS["infrastructure:elasticsearch"]="healthy"
    else
        HEALTH_RESULTS["infrastructure:elasticsearch"]="unhealthy"
        warn "Elasticsearch health check failed"
    fi
}

# Perform comprehensive health check on a service
check_service_health() {
    local service="$1"
    local service_status="healthy"
    
    info "Performing comprehensive health check for $service..."
    
    # Check container status
    if ! check_container_status "$service"; then
        service_status="unhealthy"
        OVERALL_STATUS="unhealthy"
        return 1
    fi
    
    # Check container health
    if ! check_container_health "$service"; then
        service_status="degraded"
        if [[ "$OVERALL_STATUS" == "healthy" ]]; then
            OVERALL_STATUS="degraded"
        fi
    fi
    
    # Check HTTP endpoints
    if ! check_http_endpoints "$service"; then
        service_status="unhealthy"
        OVERALL_STATUS="unhealthy"
    fi
    
    # Check service logs
    if ! check_service_logs "$service"; then
        if [[ "$service_status" == "healthy" ]]; then
            service_status="degraded"
        fi
        if [[ "$OVERALL_STATUS" == "healthy" ]]; then
            OVERALL_STATUS="degraded"
        fi
    fi
    
    # Check resource usage
    check_resource_usage "$service" || true  # Don't fail on resource check
    
    HEALTH_RESULTS["$service:overall"]="$service_status"
    
    if [[ "$service_status" == "healthy" ]]; then
        log "✅ $service is healthy"
    elif [[ "$service_status" == "degraded" ]]; then
        warn "⚠️ $service is degraded"
    else
        error "❌ $service is unhealthy"
    fi
}

# Generate console output
generate_console_output() {
    echo
    log "🏥 INVEXIS PRODUCTION HEALTH CHECK REPORT"
    log "=================================================="
    echo
    
    # Overall status
    case "$OVERALL_STATUS" in
        "healthy")
            log "🟢 OVERALL STATUS: HEALTHY"
            ;;
        "degraded")
            warn "🟡 OVERALL STATUS: DEGRADED"
            ;;
        "unhealthy")
            error "🔴 OVERALL STATUS: UNHEALTHY"
            ;;
    esac
    
    echo
    log "📊 SERVICE STATUS SUMMARY:"
    log "=========================="
    
    # Service summary
    local healthy_count=0
    local degraded_count=0
    local unhealthy_count=0
    
    for service in $(get_services_to_check); do
        local status="${HEALTH_RESULTS["$service:overall"]:-unknown}"
        case "$status" in
            "healthy") 
                echo "  ✅ $service: $status"
                ((healthy_count++))
                ;;
            "degraded") 
                echo "  ⚠️ $service: $status"
                ((degraded_count++))
                ;;
            "unhealthy"|"unknown") 
                echo "  ❌ $service: $status"
                ((unhealthy_count++))
                ;;
        esac
    done
    
    echo
    log "📈 SUMMARY STATISTICS:"
    log "====================="
    echo "  Healthy: $healthy_count"
    echo "  Degraded: $degraded_count"
    echo "  Unhealthy: $unhealthy_count"
    
    # Infrastructure summary
    echo
    log "🏗️ INFRASTRUCTURE STATUS:"
    log "========================="
    for key in "${!HEALTH_RESULTS[@]}"; do
        if [[ "$key" =~ ^(database|messaging|infrastructure): ]]; then
            local component="${key#*:}"
            local status="${HEALTH_RESULTS[$key]}"
            case "$status" in
                "connected"|"healthy") 
                    echo "  ✅ $component: $status"
                    ;;
                *) 
                    echo "  ❌ $component: $status"
                    ;;
            esac
        fi
    done
    
    echo
}

# Generate JSON output
generate_json_output() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local services=$(get_services_to_check)
    
    cat << EOF
{
  "timestamp": "$timestamp",
  "overall_status": "$OVERALL_STATUS",
  "deployment_color": "$DEPLOYMENT_COLOR",
  "services": {
EOF
    
    local first_service=true
    for service in $services; do
        if [[ "$first_service" == "false" ]]; then
            echo "    ,"
        fi
        first_service=false
        
        echo "    \"$service\": {"
        echo "      \"overall\": \"${HEALTH_RESULTS["$service:overall"]:-unknown}\","
        echo "      \"container\": \"${HEALTH_RESULTS["$service:container"]:-unknown}\","
        echo "      \"health\": \"${HEALTH_RESULTS["$service:health"]:-unknown}\","
        echo "      \"health_endpoint\": \"${HEALTH_RESULTS["$service:health_endpoint"]:-unknown}\","
        echo "      \"metrics_endpoint\": \"${HEALTH_RESULTS["$service:metrics_endpoint"]:-unknown}\","
        echo "      \"logs\": \"${HEALTH_RESULTS["$service:logs"]:-unknown}\","
        echo "      \"cpu_usage\": \"${HEALTH_RESULTS["$service:cpu_usage"]:-unknown}\","
        echo "      \"memory_usage\": \"${HEALTH_RESULTS["$service:memory_usage"]:-unknown}\""
        echo -n "    }"
    done
    
    echo
    echo "  },"
    echo "  \"infrastructure\": {"
    
    local first_infra=true
    for key in "${!HEALTH_RESULTS[@]}"; do
        if [[ "$key" =~ ^(database|messaging|infrastructure): ]]; then
            if [[ "$first_infra" == "false" ]]; then
                echo "    ,"
            fi
            first_infra=false
            
            local component="${key#*:}"
            local status="${HEALTH_RESULTS[$key]}"
            echo -n "    \"$component\": \"$status\""
        fi
    done
    
    echo
    echo "  }"
    echo "}"
}

# Generate Prometheus metrics output
generate_prometheus_output() {
    local timestamp=$(date +%s)000  # Prometheus expects milliseconds
    
    echo "# HELP invexis_service_health Service health status (1=healthy, 0.5=degraded, 0=unhealthy)"
    echo "# TYPE invexis_service_health gauge"
    
    for service in $(get_services_to_check); do
        local status="${HEALTH_RESULTS["$service:overall"]:-unknown}"
        local value
        case "$status" in
            "healthy") value=1 ;;
            "degraded") value=0.5 ;;
            *) value=0 ;;
        esac
        
        echo "invexis_service_health{service=\"$service\",deployment=\"$DEPLOYMENT_COLOR\"} $value $timestamp"
    done
    
    echo "# HELP invexis_infrastructure_health Infrastructure component health (1=healthy, 0=unhealthy)"
    echo "# TYPE invexis_infrastructure_health gauge"
    
    for key in "${!HEALTH_RESULTS[@]}"; do
        if [[ "$key" =~ ^(database|messaging|infrastructure): ]]; then
            local component="${key#*:}"
            local status="${HEALTH_RESULTS[$key]}"
            local value
            case "$status" in
                "connected"|"healthy") value=1 ;;
                *) value=0 ;;
            esac
            
            echo "invexis_infrastructure_health{component=\"$component\"} $value $timestamp"
        fi
    done
}

# Main health check function
main() {
    if [[ "$OUTPUT_FORMAT" == "console" ]]; then
        log "🚀 Starting Invexis Production Health Check"
        log "Deployment: $DEPLOYMENT_COLOR"
        log "Timeout: ${TIMEOUT}s"
        echo
    fi
    
    # Load environment
    load_environment
    
    # Get services to check
    local services=($(get_services_to_check))
    
    if [[ ${#services[@]} -eq 0 ]]; then
        error "No services found for deployment color: $DEPLOYMENT_COLOR"
        exit 1
    fi
    
    # Check each service
    for service in "${services[@]}"; do
        check_service_health "$service"
    done
    
    # Check infrastructure
    check_database_connectivity
    check_infrastructure
    
    # Generate output based on format
    case "$OUTPUT_FORMAT" in
        "console")
            generate_console_output
            ;;
        "json")
            generate_json_output
            ;;
        "prometheus")
            generate_prometheus_output
            ;;
    esac
    
    # Exit with appropriate code
    case "$OVERALL_STATUS" in
        "healthy") exit 0 ;;
        "degraded") exit 1 ;;
        "unhealthy") exit 2 ;;
    esac
}

# Handle script arguments
case "${1:-blue}" in
    "--help"|"-h")
        echo "Usage: $0 [DEPLOYMENT_COLOR] [OPTIONS]"
        echo ""
        echo "Perform comprehensive health checks on Invexis production services"
        echo ""
        echo "Arguments:"
        echo "  DEPLOYMENT_COLOR    blue, green, or all (default: blue)"
        echo ""
        echo "Environment Variables:"
        echo "  TIMEOUT            Health check timeout in seconds (default: 30)"
        echo "  VERBOSE            Enable verbose output (default: false)"
        echo "  OUTPUT_FORMAT      Output format: console, json, prometheus (default: console)"
        echo ""
        echo "Examples:"
        echo "  $0 blue                    # Check blue deployment"
        echo "  $0 green                   # Check green deployment"
        echo "  $0 all                     # Check all deployments"
        echo "  OUTPUT_FORMAT=json $0      # Output as JSON"
        echo "  VERBOSE=true $0            # Verbose output"
        exit 0
        ;;
    "blue"|"green"|"all"|"")
        main
        ;;
    *)
        error "Invalid deployment color: $1"
        echo "Use 'blue', 'green', 'all', or --help"
        exit 1
        ;;
esac