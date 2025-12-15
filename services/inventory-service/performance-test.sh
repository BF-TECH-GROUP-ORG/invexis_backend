#!/bin/bash
# Performance Verification Script
# Run this after deploying optimizations to verify improvements

set -e

echo "================================"
echo "Inventory Service Performance Test"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
COMPANY_ID="perf-test-company"
REQUESTS=20
CONCURRENT=5

# Function to check if API is up
check_api() {
    echo "Checking API availability..."
    if ! curl -s "$API_URL/v1/products" > /dev/null 2>&1; then
        echo -e "${RED}✗ API is not responding at $API_URL${NC}"
        echo "Please ensure the service is running:"
        echo "  npm run dev"
        exit 1
    fi
    echo -e "${GREEN}✓ API is online${NC}"
    echo ""
}

# Function to check Redis
check_redis() {
    echo "Checking Redis availability..."
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Redis is available${NC}"
            # Get stats
            HITS=$(redis-cli INFO stats | grep hits | cut -d: -f2)
            MISSES=$(redis-cli INFO stats | grep misses | cut -d: -f2)
            echo "  Hits: $HITS, Misses: $MISSES"
        else
            echo -e "${YELLOW}⚠ Redis is not running${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ redis-cli not found${NC}"
    fi
    echo ""
}

# Function to test product creation response time
test_creation_speed() {
    echo "Testing product creation speed..."
    echo "(Measuring 20 sequential requests)"
    echo ""

    total_time=0
    min_time=999999
    max_time=0

    for i in {1..20}; do
        response=$(curl -s -w "\n%{time_total}" -X POST "$API_URL/v1/products" \
            -H "Content-Type: application/json" \
            -d "{
                \"companyId\": \"$COMPANY_ID\",
                \"name\": \"Perf Test Product $i\",
                \"brand\": \"Test Brand\",
                \"category\": \"507f1f77bcf86cd799439011\",
                \"pricing\": { \"basePrice\": $((50 + i)) },
                \"description\": { \"short\": \"Performance test\" }
            }")
        
        time_taken=$(echo "$response" | tail -1)
        time_ms=$(echo "$time_taken * 1000" | bc)
        
        printf "Request %2d: %.0fms\n" $i $time_ms
        
        # Update min/max
        time_int=${time_ms%.*}
        if [ "$time_int" -lt "$min_time" ]; then min_time=$time_int; fi
        if [ "$time_int" -gt "$max_time" ]; then max_time=$time_int; fi
        
        total_time=$(echo "$total_time + $time_ms" | bc)
    done

    avg_time=$(echo "scale=0; $total_time / 20" | bc)
    
    echo ""
    echo "Results:"
    echo "  Average: ${avg_time}ms"
    echo "  Min:     ${min_time}ms"
    echo "  Max:     ${max_time}ms"
    
    if [ "$avg_time" -lt 100 ]; then
        echo -e "  ${GREEN}✓ PASS: Average <100ms${NC}"
    elif [ "$avg_time" -lt 200 ]; then
        echo -e "  ${YELLOW}⚠ WARN: Average <200ms${NC}"
    else
        echo -e "  ${RED}✗ FAIL: Average >200ms${NC}"
    fi
    echo ""
}

# Function to test list speed (cache hit vs miss)
test_list_speed() {
    echo "Testing product list speed..."
    echo ""

    # Cache miss (first request)
    echo "Cache miss (first request):"
    redis-cli FLUSHALL > /dev/null 2>&1 || true
    time_miss=$(curl -s -w "%{time_total}" "$API_URL/v1/products?companyId=$COMPANY_ID&limit=10" > /dev/null)
    time_miss_ms=$(echo "$time_miss * 1000" | bc)
    printf "  Time: %.0fms\n" $time_miss_ms
    
    # Cache hit (repeated request)
    echo "Cache hit (repeated request):"
    time_hit=$(curl -s -w "%{time_total}" "$API_URL/v1/products?companyId=$COMPANY_ID&limit=10" > /dev/null)
    time_hit_ms=$(echo "$time_hit * 1000" | bc)
    printf "  Time: %.0fms\n" $time_hit_ms
    
    improvement=$(echo "scale=1; ($time_miss - $time_hit) / $time_miss * 100" | bc)
    echo "  Improvement: ${improvement}%"
    
    if (( $(echo "$time_hit_ms < 5" | bc -l) )); then
        echo -e "  ${GREEN}✓ PASS: Cache hit <5ms${NC}"
    else
        echo -e "  ${YELLOW}⚠ WARN: Cache hit ${time_hit_ms}ms${NC}"
    fi
    
    if (( $(echo "$time_miss_ms < 100" | bc -l) )); then
        echo -e "  ${GREEN}✓ PASS: Cache miss <100ms${NC}"
    else
        echo -e "  ${YELLOW}⚠ WARN: Cache miss ${time_miss_ms}ms${NC}"
    fi
    echo ""
}

# Function to test single product lookup
test_single_product() {
    echo "Testing single product lookup..."
    echo ""

    # Get a product ID from list
    product_id=$(curl -s "$API_URL/v1/products?companyId=$COMPANY_ID&limit=1" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$product_id" ]; then
        echo -e "${YELLOW}⚠ No products found, skipping single product test${NC}"
        return
    fi

    echo "Testing product: $product_id"
    
    # Cache miss
    redis-cli DEL "product:$product_id" > /dev/null 2>&1 || true
    echo "Cache miss:"
    time_miss=$(curl -s -w "%{time_total}" "$API_URL/v1/products/$product_id" > /dev/null)
    time_miss_ms=$(echo "$time_miss * 1000" | bc)
    printf "  Time: %.0fms\n" $time_miss_ms
    
    # Cache hit
    echo "Cache hit:"
    time_hit=$(curl -s -w "%{time_total}" "$API_URL/v1/products/$product_id" > /dev/null)
    time_hit_ms=$(echo "$time_hit * 1000" | bc)
    printf "  Time: %.0fms\n" $time_hit_ms
    
    if (( $(echo "$time_hit_ms < 3" | bc -l) )); then
        echo -e "  ${GREEN}✓ PASS: Cache hit <3ms${NC}"
    fi
    
    if (( $(echo "$time_miss_ms < 50" | bc -l) )); then
        echo -e "  ${GREEN}✓ PASS: Cache miss <50ms${NC}"
    fi
    echo ""
}

# Function to test error handling with missing Redis
test_redis_failover() {
    echo "Testing Redis graceful degradation..."
    
    if ! command -v redis-cli &> /dev/null; then
        echo -e "${YELLOW}⚠ Skipping: redis-cli not found${NC}"
        return
    fi
    
    echo "Stopping Redis..."
    redis-cli SHUTDOWN NOSAVE > /dev/null 2>&1 || true
    sleep 1
    
    echo "Testing product creation without Redis..."
    response=$(curl -s -X POST "$API_URL/v1/products" \
        -H "Content-Type: application/json" \
        -d "{
            \"companyId\": \"$COMPANY_ID\",
            \"name\": \"No Redis Test\",
            \"brand\": \"Test\",
            \"category\": \"507f1f77bcf86cd799439011\",
            \"pricing\": { \"basePrice\": 99.99 },
            \"description\": { \"short\": \"Test\" }
        }")
    
    if echo "$response" | grep -q "success.*true"; then
        echo -e "${GREEN}✓ PASS: API works without Redis${NC}"
    else
        echo -e "${RED}✗ FAIL: API failed without Redis${NC}"
    fi
    
    echo "Restarting Redis..."
    redis-server --daemonize yes > /dev/null 2>&1 || true
    sleep 1
    echo ""
}

# Main execution
main() {
    check_api
    check_redis
    test_creation_speed
    test_list_speed
    test_single_product
    
    echo "================================"
    echo "Performance Test Complete!"
    echo "================================"
    echo ""
    echo "Summary:"
    echo "✓ Product creation: should be <100ms"
    echo "✓ List cache hit:  should be <5ms"
    echo "✓ List cache miss: should be <100ms"
    echo "✓ Single product:  should be <50ms (miss), <3ms (hit)"
    echo ""
    echo "See PERFORMANCE_TESTING.md for detailed instructions"
}

main "$@"
