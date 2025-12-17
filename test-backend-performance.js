#!/usr/bin/env node
/**
 * Comprehensive Backend Performance Test Suite
 * Tests all critical endpoints across all services
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:8000';
const ITERATIONS = parseInt(process.env.ITERATIONS) || 5;

// Test credentials
const TEST_USER = {
    identifier: process.env.TEST_EMAIL || 'harrymccall@gmail.com',
    password: process.env.TEST_PASSWORD || 'Test@1234567'
};

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

// Performance thresholds (ms)
const THRESHOLDS = {
    excellent: 500,
    good: 1000,
    acceptable: 2000,
    slow: 5000
};

function getPerformanceRating(time) {
    if (time < THRESHOLDS.excellent) return { rating: 'EXCELLENT', color: colors.green };
    if (time < THRESHOLDS.good) return { rating: 'GOOD', color: colors.green };
    if (time < THRESHOLDS.acceptable) return { rating: 'ACCEPTABLE', color: colors.yellow };
    if (time < THRESHOLDS.slow) return { rating: 'SLOW', color: colors.yellow };
    return { rating: 'VERY SLOW', color: colors.red };
}

function formatTime(ms) {
    return `${ms.toFixed(0)}ms`;
}

async function testEndpoint(name, method, url, data = null, headers = {}) {
    const times = [];
    let lastResponse = null;
    
    for (let i = 0; i < ITERATIONS; i++) {
        const start = Date.now();
        try {
            const config = {
                method,
                url: `${API_BASE}${url}`,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };
            
            if (data) config.data = data;
            
            const response = await axios(config);
            const duration = Date.now() - start;
            times.push(duration);
            lastResponse = response;
        } catch (error) {
            const duration = Date.now() - start;
            times.push(duration);
            if (error.response?.status !== 401 && error.response?.status !== 404) {
                console.error(`  ${colors.red}✗ Error:${colors.reset} ${error.message}`);
            }
        }
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const { rating, color } = getPerformanceRating(avg);
    
    console.log(`  ${color}${rating}${colors.reset} - ${name}`);
    console.log(`    Avg: ${formatTime(avg)} | Min: ${formatTime(min)} | Max: ${formatTime(max)}`);
    
    return { name, avg, min, max, rating, lastResponse };
}

async function runTests() {
    console.log(`\n${colors.bold}${colors.cyan}=== Backend Performance Test Suite ===${colors.reset}\n`);
    console.log(`API Base: ${API_BASE}`);
    console.log(`Iterations per test: ${ITERATIONS}\n`);
    
    const results = [];
    let accessToken = null;
    
    // ========== AUTH SERVICE ==========
    console.log(`${colors.bold}${colors.cyan}[1] Auth Service${colors.reset}`);
    
    // Login
    const loginResult = await testEndpoint(
        'Login',
        'POST',
        '/api/auth/login',
        TEST_USER
    );
    results.push(loginResult);
    
    if (loginResult.lastResponse?.data?.accessToken) {
        accessToken = loginResult.lastResponse.data.accessToken;
    }
    
    const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    
    // Refresh Token
    if (loginResult.lastResponse?.data?.refreshToken) {
        const refreshResult = await testEndpoint(
            'Refresh Token',
            'POST',
            '/api/auth/refresh',
            { refreshToken: loginResult.lastResponse.data.refreshToken }
        );
        results.push(refreshResult);
    }
    
    // Get Profile
    if (accessToken) {
        const profileResult = await testEndpoint(
            'Get Profile',
            'GET',
            '/api/auth/profile',
            null,
            authHeaders
        );
        results.push(profileResult);
    }
    
    console.log('');
    
    // ========== COMPANY SERVICE ==========
    console.log(`${colors.bold}${colors.cyan}[2] Company Service${colors.reset}`);
    
    if (accessToken) {
        const companiesResult = await testEndpoint(
            'List Companies',
            'GET',
            '/api/companies',
            null,
            authHeaders
        );
        results.push(companiesResult);
    }
    
    console.log('');

    // ========== INVENTORY SERVICE ==========
    console.log(`${colors.bold}${colors.cyan}[3] Inventory Service${colors.reset}`);

    if (accessToken) {
        const productsResult = await testEndpoint(
            'List Products',
            'GET',
            '/api/inventory/products?limit=20',
            null,
            authHeaders
        );
        results.push(productsResult);

        const categoriesResult = await testEndpoint(
            'List Categories',
            'GET',
            '/api/inventory/categories',
            null,
            authHeaders
        );
        results.push(categoriesResult);

        const stockResult = await testEndpoint(
            'Get Stock Overview',
            'GET',
            '/api/inventory/stock',
            null,
            authHeaders
        );
        results.push(stockResult);
    }

    console.log('');

    // ========== SALES SERVICE ==========
    console.log(`${colors.bold}${colors.cyan}[4] Sales Service${colors.reset}`);

    if (accessToken) {
        const salesResult = await testEndpoint(
            'List Sales',
            'GET',
            '/api/sales?limit=20',
            null,
            authHeaders
        );
        results.push(salesResult);
    }

    console.log('');

    // ========== ANALYTICS SERVICE ==========
    console.log(`${colors.bold}${colors.cyan}[5] Analytics Service${colors.reset}`);

    if (accessToken) {
        const analyticsResult = await testEndpoint(
            'Get Analytics Dashboard',
            'GET',
            '/api/analytics/dashboard',
            null,
            authHeaders
        );
        results.push(analyticsResult);
    }

    console.log('');

    // ========== SUMMARY ==========
    console.log(`${colors.bold}${colors.cyan}=== Performance Summary ===${colors.reset}\n`);

    const excellentCount = results.filter(r => r.rating === 'EXCELLENT').length;
    const goodCount = results.filter(r => r.rating === 'GOOD').length;
    const acceptableCount = results.filter(r => r.rating === 'ACCEPTABLE').length;
    const slowCount = results.filter(r => r.rating === 'SLOW').length;
    const verySlowCount = results.filter(r => r.rating === 'VERY SLOW').length;

    console.log(`Total Tests: ${results.length}`);
    console.log(`${colors.green}Excellent (<500ms): ${excellentCount}${colors.reset}`);
    console.log(`${colors.green}Good (<1s): ${goodCount}${colors.reset}`);
    console.log(`${colors.yellow}Acceptable (<2s): ${acceptableCount}${colors.reset}`);
    console.log(`${colors.yellow}Slow (<5s): ${slowCount}${colors.reset}`);
    console.log(`${colors.red}Very Slow (>5s): ${verySlowCount}${colors.reset}`);

    const avgAll = results.reduce((sum, r) => sum + r.avg, 0) / results.length;
    console.log(`\nOverall Average: ${formatTime(avgAll)}`);

    // Show slowest endpoints
    console.log(`\n${colors.bold}Slowest Endpoints:${colors.reset}`);
    const slowest = [...results].sort((a, b) => b.avg - a.avg).slice(0, 5);
    slowest.forEach((r, i) => {
        const { color } = getPerformanceRating(r.avg);
        console.log(`  ${i + 1}. ${r.name}: ${color}${formatTime(r.avg)}${colors.reset}`);
    });

    // Show fastest endpoints
    console.log(`\n${colors.bold}Fastest Endpoints:${colors.reset}`);
    const fastest = [...results].sort((a, b) => a.avg - b.avg).slice(0, 5);
    fastest.forEach((r, i) => {
        const { color } = getPerformanceRating(r.avg);
        console.log(`  ${i + 1}. ${r.name}: ${color}${formatTime(r.avg)}${colors.reset}`);
    });

    console.log('');
}

// Run tests
runTests().catch(error => {
    console.error(`${colors.red}Test suite failed:${colors.reset}`, error.message);
    process.exit(1);
});

