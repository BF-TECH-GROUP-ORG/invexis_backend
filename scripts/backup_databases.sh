#!/bin/bash
# ==================================================================================
# DATABASE BACKUP SCRIPT - INVEXIS PRODUCTION
# ==================================================================================
# This script handles automated backups of all production databases
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

# Backup configuration
BACKUP_DIR="${BACKUP_DIR:-/backup/invexis}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_SESSION_DIR="$BACKUP_DIR/$TIMESTAMP"

# Logging
LOG_FILE="/var/log/invexis/backup-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$BACKUP_SESSION_DIR"

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

# Load environment variables
load_environment() {
    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
        log "✅ Environment loaded successfully"
    else
        error "Environment file not found: $ENV_FILE"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log "🔍 Checking backup prerequisites..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running"
        exit 1
    fi
    
    # Check backup directory permissions
    if [[ ! -w "$(dirname "$BACKUP_DIR")" ]]; then
        error "Cannot write to backup directory: $BACKUP_DIR"
        exit 1
    fi
    
    # Check available disk space (require at least 5GB)
    local available_space=$(df "$(dirname "$BACKUP_DIR")" | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 5242880 ]]; then  # 5GB in KB
        warn "⚠️ Low disk space available for backups: $(($available_space / 1024))MB"
    fi
    
    log "✅ Prerequisites check passed"
}

# Backup PostgreSQL databases
backup_postgresql() {
    local db_name="$1"
    local container_name="$2"
    local password="$3"
    
    info "📦 Backing up PostgreSQL database: $db_name"
    
    local backup_file="$BACKUP_SESSION_DIR/${db_name}_${TIMESTAMP}.sql"
    local compressed_file="${backup_file}.gz"
    
    # Create database dump
    if docker exec -e PGPASSWORD="$password" "$container_name" pg_dump -U invexis -d "$db_name" --verbose --no-password > "$backup_file"; then
        # Compress the backup
        if gzip "$backup_file"; then
            local file_size=$(stat -c%s "$compressed_file")
            log "✅ PostgreSQL backup completed: $db_name ($(numfmt --to=iec "$file_size"))"
            echo "$compressed_file" >> "$BACKUP_SESSION_DIR/backup_manifest.txt"
            return 0
        else
            error "❌ Failed to compress PostgreSQL backup: $db_name"
            rm -f "$backup_file"
            return 1
        fi
    else
        error "❌ PostgreSQL backup failed: $db_name"
        rm -f "$backup_file"
        return 1
    fi
}

# Backup MySQL database
backup_mysql() {
    local db_name="$1"
    local container_name="$2"
    local password="$3"
    
    info "📦 Backing up MySQL database: $db_name"
    
    local backup_file="$BACKUP_SESSION_DIR/${db_name}_${TIMESTAMP}.sql"
    local compressed_file="${backup_file}.gz"
    
    # Create database dump
    if docker exec "$container_name" mysqldump -u root -p"$password" --single-transaction --routines --triggers "$db_name" > "$backup_file"; then
        # Compress the backup
        if gzip "$backup_file"; then
            local file_size=$(stat -c%s "$compressed_file")
            log "✅ MySQL backup completed: $db_name ($(numfmt --to=iec "$file_size"))"
            echo "$compressed_file" >> "$BACKUP_SESSION_DIR/backup_manifest.txt"
            return 0
        else
            error "❌ Failed to compress MySQL backup: $db_name"
            rm -f "$backup_file"
            return 1
        fi
    else
        error "❌ MySQL backup failed: $db_name"
        rm -f "$backup_file"
        return 1
    fi
}

# Backup MongoDB databases
backup_mongodb() {
    local container_name="$1"
    local password="$2"
    
    info "📦 Backing up MongoDB databases"
    
    local backup_dir="$BACKUP_SESSION_DIR/mongodb_${TIMESTAMP}"
    mkdir -p "$backup_dir"
    
    # Create MongoDB dump
    if docker exec "$container_name" mongodump --username root --password "$password" --authenticationDatabase admin --out /tmp/mongodb_backup; then
        # Copy backup from container
        if docker cp "$container_name:/tmp/mongodb_backup" "$backup_dir/"; then
            # Compress the backup
            local compressed_file="$BACKUP_SESSION_DIR/mongodb_${TIMESTAMP}.tar.gz"
            if tar -czf "$compressed_file" -C "$backup_dir" .; then
                local file_size=$(stat -c%s "$compressed_file")
                log "✅ MongoDB backup completed ($(numfmt --to=iec "$file_size"))"
                echo "$compressed_file" >> "$BACKUP_SESSION_DIR/backup_manifest.txt"
                
                # Cleanup temporary directories
                rm -rf "$backup_dir"
                docker exec "$container_name" rm -rf /tmp/mongodb_backup
                return 0
            else
                error "❌ Failed to compress MongoDB backup"
                return 1
            fi
        else
            error "❌ Failed to copy MongoDB backup from container"
            return 1
        fi
    else
        error "❌ MongoDB backup failed"
        return 1
    fi
}

# Backup Redis data
backup_redis() {
    local container_name="$1"
    
    info "📦 Backing up Redis data"
    
    local backup_file="$BACKUP_SESSION_DIR/redis_${TIMESTAMP}.rdb"
    local compressed_file="${backup_file}.gz"
    
    # Force Redis to save current state
    if docker exec "$container_name" redis-cli -a "$REDIS_PASSWORD" BGSAVE; then
        # Wait for background save to complete
        sleep 5
        
        # Check if save completed
        local save_status=""
        local attempts=0
        while [[ $attempts -lt 30 ]]; do
            save_status=$(docker exec "$container_name" redis-cli -a "$REDIS_PASSWORD" LASTSAVE 2>/dev/null || echo "")
            if [[ -n "$save_status" ]]; then
                break
            fi
            sleep 1
            ((attempts++))
        done
        
        # Copy RDB file from container
        if docker cp "$container_name:/data/dump.rdb" "$backup_file"; then
            # Compress the backup
            if gzip "$backup_file"; then
                local file_size=$(stat -c%s "$compressed_file")
                log "✅ Redis backup completed ($(numfmt --to=iec "$file_size"))"
                echo "$compressed_file" >> "$BACKUP_SESSION_DIR/backup_manifest.txt"
                return 0
            else
                error "❌ Failed to compress Redis backup"
                rm -f "$backup_file"
                return 1
            fi
        else
            error "❌ Failed to copy Redis backup"
            return 1
        fi
    else
        error "❌ Redis backup failed"
        return 1
    fi
}

# Backup configuration files
backup_configurations() {
    info "📦 Backing up configuration files"
    
    local config_backup_dir="$BACKUP_SESSION_DIR/configurations"
    mkdir -p "$config_backup_dir"
    
    # Backup important configuration files
    local config_files=(
        "$PROJECT_ROOT/deployments"
        "$PROJECT_ROOT/docker-compose.yml"
        "$PROJECT_ROOT/scripts"
    )
    
    for config in "${config_files[@]}"; do
        if [[ -e "$config" ]]; then
            cp -r "$config" "$config_backup_dir/" 2>/dev/null || warn "Failed to backup $config"
        fi
    done
    
    # Compress configuration backup
    local compressed_file="$BACKUP_SESSION_DIR/configurations_${TIMESTAMP}.tar.gz"
    if tar -czf "$compressed_file" -C "$config_backup_dir" .; then
        local file_size=$(stat -c%s "$compressed_file")
        log "✅ Configuration backup completed ($(numfmt --to=iec "$file_size"))"
        echo "$compressed_file" >> "$BACKUP_SESSION_DIR/backup_manifest.txt"
        
        # Remove uncompressed directory
        rm -rf "$config_backup_dir"
    else
        error "❌ Failed to compress configuration backup"
    fi
}

# Main backup function
run_backups() {
    log "🚀 Starting database backups for Invexis production"
    
    local backup_start_time=$(date +%s)
    local failed_backups=()
    local successful_backups=()
    
    # PostgreSQL databases
    local postgres_dbs=(
        "companydb:invexis-company-postgres-prod:$COMPANY_POSTGRES_PASSWORD"
        "shopdb:invexis-shop-postgres-prod:$SHOP_POSTGRES_PASSWORD"
        "paymentdb:invexis-payment-postgres-prod:$PAYMENT_POSTGRES_PASSWORD"
        "analyticsdb:invexis-analytics-postgres-prod:$ANALYTICS_POSTGRES_PASSWORD"
    )
    
    for db_info in "${postgres_dbs[@]}"; do
        IFS=':' read -r db_name container_name password <<< "$db_info"
        if backup_postgresql "$db_name" "$container_name" "$password"; then
            successful_backups+=("PostgreSQL:$db_name")
        else
            failed_backups+=("PostgreSQL:$db_name")
        fi
    done
    
    # MySQL database
    if backup_mysql "salesdb" "invexis-sales-mysql-prod" "$MYSQL_ROOT_PASSWORD"; then
        successful_backups+=("MySQL:salesdb")
    else
        failed_backups+=("MySQL:salesdb")
    fi
    
    # MongoDB databases
    if backup_mongodb "invexis-mongodb-prod" "$MONGO_ROOT_PASSWORD"; then
        successful_backups+=("MongoDB:all")
    else
        failed_backups+=("MongoDB:all")
    fi
    
    # Redis data
    if backup_redis "invexis-redis-prod"; then
        successful_backups+=("Redis:cache")
    else
        failed_backups+=("Redis:cache")
    fi
    
    # Configuration files
    backup_configurations
    successful_backups+=("Configurations")
    
    # Calculate backup duration
    local backup_end_time=$(date +%s)
    local backup_duration=$((backup_end_time - backup_start_time))
    
    # Create backup summary
    create_backup_summary "$backup_duration" "${successful_backups[@]}" "${failed_backups[@]}"
    
    # Report results
    if [[ ${#failed_backups[@]} -eq 0 ]]; then
        log "🎉 All backups completed successfully!"
    else
        error "❌ Some backups failed: ${failed_backups[*]}"
        return 1
    fi
}

# Create backup summary
create_backup_summary() {
    local duration="$1"
    shift
    local successful=("$@")
    
    # Find where failed backups start (they come after successful ones)
    local failed=()
    local found_failed=false
    for item in "${successful[@]}"; do
        if [[ "$item" == "FAILED_START" ]]; then
            found_failed=true
            continue
        fi
        if [[ "$found_failed" == true ]]; then
            failed+=("$item")
        fi
    done
    
    # Remove failed items from successful array
    if [[ "$found_failed" == true ]]; then
        for i in "${!successful[@]}"; do
            if [[ "${successful[$i]}" == "FAILED_START" ]]; then
                successful=("${successful[@]:0:$i}")
                shift $i
                failed=("$@")
                break
            fi
        done
    fi
    
    local summary_file="$BACKUP_SESSION_DIR/backup_summary.txt"
    
    cat > "$summary_file" << EOF
==================================================================================
INVEXIS PRODUCTION DATABASE BACKUP SUMMARY
==================================================================================
Backup Date: $(date)
Backup Duration: ${duration} seconds
Backup Location: $BACKUP_SESSION_DIR

SUCCESSFUL BACKUPS:
$(printf '  ✅ %s\n' "${successful[@]}")

$(if [[ ${#failed[@]} -gt 0 ]]; then
    echo "FAILED BACKUPS:"
    printf '  ❌ %s\n' "${failed[@]}"
fi)

BACKUP FILES:
$(if [[ -f "$BACKUP_SESSION_DIR/backup_manifest.txt" ]]; then
    while read -r file; do
        if [[ -f "$file" ]]; then
            echo "  - $(basename "$file") ($(numfmt --to=iec $(stat -c%s "$file")))"
        fi
    done < "$BACKUP_SESSION_DIR/backup_manifest.txt"
fi)

TOTAL BACKUP SIZE: $(du -sh "$BACKUP_SESSION_DIR" | cut -f1)

==================================================================================
EOF

    log "📄 Backup summary created: $summary_file"
}

# Cleanup old backups
cleanup_old_backups() {
    log "🧹 Cleaning up backups older than $BACKUP_RETENTION_DAYS days"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        # Find and remove old backup directories
        find "$BACKUP_DIR" -type d -name "[0-9]*_[0-9]*" -mtime +$BACKUP_RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
        
        # Count remaining backups
        local backup_count=$(find "$BACKUP_DIR" -type d -name "[0-9]*_[0-9]*" | wc -l)
        log "📊 Backup retention: $backup_count backup sessions remaining"
    fi
}

# Upload backup to remote storage (optional)
upload_backup() {
    if [[ -n "${BACKUP_S3_BUCKET:-}" ]] && command -v aws >/dev/null 2>&1; then
        log "☁️ Uploading backup to S3..."
        
        local archive_name="invexis-backup-${TIMESTAMP}.tar.gz"
        local archive_path="/tmp/$archive_name"
        
        # Create archive of entire backup session
        if tar -czf "$archive_path" -C "$(dirname "$BACKUP_SESSION_DIR")" "$(basename "$BACKUP_SESSION_DIR")"; then
            # Upload to S3
            if aws s3 cp "$archive_path" "s3://$BACKUP_S3_BUCKET/invexis/"; then
                log "✅ Backup uploaded to S3: s3://$BACKUP_S3_BUCKET/invexis/$archive_name"
                rm -f "$archive_path"
            else
                error "❌ Failed to upload backup to S3"
            fi
        else
            error "❌ Failed to create backup archive for upload"
        fi
    fi
}

# Send backup notification
send_notification() {
    local status="$1"
    local duration="$2"
    
    if command -v node >/dev/null 2>&1 && [[ -f "$PROJECT_ROOT/deployments/slack/notifications.config.js" ]]; then
        info "📢 Sending backup notification..."
        
        local backup_size=$(du -sh "$BACKUP_SESSION_DIR" | cut -f1)
        local databases=("PostgreSQL" "MySQL" "MongoDB" "Redis")
        
        node -e "
            const { slackNotifier } = require('$PROJECT_ROOT/deployments/slack/notifications.config.js');
            slackNotifier.backupNotification({
                status: '$status',
                databases: $(printf '%s\n' "${databases[@]}" | jq -R . | jq -s .),
                duration: '${duration}s',
                size: '$backup_size'
            }).catch(console.error);
        "
    fi
}

# Main function
main() {
    log "🚀 Starting Invexis Production Database Backup"
    
    local start_time=$(date +%s)
    
    # Run backup process
    check_prerequisites
    load_environment
    
    if run_backups; then
        local end_time=$(date +%s)
        local total_duration=$((end_time - start_time))
        
        cleanup_old_backups
        upload_backup
        
        log "🎉 Backup process completed successfully!"
        log "📊 Total duration: ${total_duration}s"
        log "📁 Backup location: $BACKUP_SESSION_DIR"
        
        send_notification "success" "$total_duration"
    else
        local end_time=$(date +%s)
        local total_duration=$((end_time - start_time))
        
        error "❌ Backup process completed with errors"
        send_notification "failed" "$total_duration"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    "--help"|"-h")
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Backup all Invexis production databases and configurations"
        echo ""
        echo "Environment Variables:"
        echo "  BACKUP_DIR             Backup directory path (default: /backup/invexis)"
        echo "  BACKUP_RETENTION_DAYS  Days to retain backups (default: 30)"
        echo "  BACKUP_S3_BUCKET       S3 bucket for remote backup storage (optional)"
        echo ""
        echo "Options:"
        echo "  --cleanup-only         Only cleanup old backups"
        echo "  --dry-run             Show what would be backed up without doing it"
        echo ""
        exit 0
        ;;
    "--cleanup-only")
        load_environment
        cleanup_old_backups
        exit 0
        ;;
    "--dry-run")
        echo "DRY RUN: Would backup the following:"
        echo "  - PostgreSQL: companydb, shopdb, paymentdb, analyticsdb"
        echo "  - MySQL: salesdb"
        echo "  - MongoDB: all databases"
        echo "  - Redis: cache data"
        echo "  - Configuration files"
        echo ""
        echo "Backup would be stored in: $BACKUP_SESSION_DIR"
        exit 0
        ;;
    "")
        main "$@"
        ;;
    *)
        error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac