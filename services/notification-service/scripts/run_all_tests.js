#!/usr/bin/env node
/**
 * Master Test Runner
 * Runs all event consistency tests sequentially
 */

const { execSync } = require('child_process');
const path = require('path');

const tests = [
    { name: 'Sale Event', script: 'test_sale_event.js' },
    { name: 'Inventory Events', script: 'test_inventory_events.js' },
    { name: 'Debt Events', script: 'test_debt_events.js' }
];

console.log('🚀 Event Consistency Test Suite');
console.log('='.repeat(60));
console.log('');

let passed = 0;
let failed = 0;

for (const test of tests) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${test.name}`);
    console.log('='.repeat(60));

    try {
        const scriptPath = path.join(__dirname, test.script);
        execSync(`node ${scriptPath}`, {
            stdio: 'inherit',
            cwd: __dirname
        });
        passed++;
        console.log(`\n✅ ${test.name} PASSED`);
    } catch (error) {
        failed++;
        console.error(`\n❌ ${test.name} FAILED`);
    }

    // Wait between tests
    if (tests.indexOf(test) < tests.length - 1) {
        console.log('\nWaiting 2 seconds before next test...');
        execSync('sleep 2');
    }
}

console.log(`\n${'='.repeat(60)}`);
console.log('Test Results Summary');
console.log('='.repeat(60));
console.log(`Total Tests: ${tests.length}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ❌`);
console.log('='.repeat(60));

if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check logs above for details.');
    process.exit(1);
} else {
    console.log('\n🎉 All tests passed!');
    console.log('\n📋 Next Steps:');
    console.log('  1. Check notification-service logs for event processing');
    console.log('  2. Verify notifications were created in the database');
    console.log('  3. Check that channel configuration was respected');
    process.exit(0);
}
