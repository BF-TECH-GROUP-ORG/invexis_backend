#!/usr/bin/env node
/**
 * Login Performance Test Script
 * Tests the login endpoint performance
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:8001';
const TEST_USER = {
    identifier: process.env.TEST_EMAIL || 'harrymccall@gmail.com',
    password: process.env.TEST_PASSWORD || 'Test@1234567'
};

async function testLogin() {
    console.log('🧪 Testing Login Performance...');
    console.log('API URL:', API_URL);
    console.log('Test User:', TEST_USER.identifier);
    console.log('---');

    const startTime = Date.now();
    
    try {
        const response = await axios.post(`${API_URL}/auth/login`, TEST_USER, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 120000 // 2 minute timeout
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log('✅ Login Successful!');
        console.log('⏱️  Response Time:', duration, 'ms');
        console.log('📊 Performance Rating:', 
            duration < 500 ? '🟢 Excellent' :
            duration < 1000 ? '🟡 Good' :
            duration < 3000 ? '🟠 Acceptable' :
            '🔴 Needs Optimization'
        );
        console.log('---');
        console.log('Response Status:', response.status);
        console.log('User Role:', response.data.user?.role);
        console.log('Access Token:', response.data.accessToken ? '✓ Present' : '✗ Missing');
        
        return { success: true, duration };
    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        console.error('❌ Login Failed!');
        console.error('⏱️  Time Before Error:', duration, 'ms');
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Error:', error.response.data);
        } else if (error.request) {
            console.error('No response received from server');
            console.error('Error:', error.message);
        } else {
            console.error('Error:', error.message);
        }
        
        return { success: false, duration, error: error.message };
    }
}

async function runMultipleTests(count = 3) {
    console.log(`\n🔄 Running ${count} login tests...\n`);
    
    const results = [];
    
    for (let i = 1; i <= count; i++) {
        console.log(`\n📝 Test ${i}/${count}`);
        const result = await testLogin();
        results.push(result);
        
        // Wait 2 seconds between tests
        if (i < count) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n\n📈 Summary:');
    console.log('---');
    
    const successfulTests = results.filter(r => r.success);
    const failedTests = results.filter(r => !r.success);
    
    console.log('Total Tests:', count);
    console.log('Successful:', successfulTests.length);
    console.log('Failed:', failedTests.length);
    
    if (successfulTests.length > 0) {
        const durations = successfulTests.map(r => r.duration);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const minDuration = Math.min(...durations);
        const maxDuration = Math.max(...durations);
        
        console.log('\n⏱️  Response Times:');
        console.log('  Average:', avgDuration.toFixed(2), 'ms');
        console.log('  Minimum:', minDuration, 'ms');
        console.log('  Maximum:', maxDuration, 'ms');
    }
}

// Run the tests
const testCount = parseInt(process.argv[2]) || 3;
runMultipleTests(testCount).then(() => {
    console.log('\n✅ All tests completed!\n');
    process.exit(0);
}).catch(err => {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
});

