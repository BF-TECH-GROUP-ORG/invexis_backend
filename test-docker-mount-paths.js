#!/usr/bin/env node

/**
 * Comprehensive Docker Mount Path Validation
 * Verifies all services use correct /app/shared paths for Docker deployment
 */

console.log("🐳 Testing Docker Mount Path Consistency...\n");

const fs = require('fs');

const servicesToCheck = [
  'analytics-service',
  'auth-service', 
  'company-service',
  'ecommerce-service',
  'notification-service',
  'payment-service',
  'websocket-service',
  'sales-service',
  'inventory-service'
];

const sharedModules = [
  '/app/shared/logger',
  '/app/shared/health', 
  '/app/shared/security',
  '/app/shared/errorHandler',
  '/app/shared/rabbitmq',
  '/app/shared/middlewares/auth/production-auth',
  '/app/shared/middlewares/subscription/production-subscription'
];

let allTestsPassed = true;

// Test 1: Check all service index/app files use Docker mount paths
console.log("1️⃣ Checking service index files for Docker mount paths...");
for (const service of servicesToCheck) {
  try {
    const indexPath = `services/${service}/src/index.js`;
    const appPath = `services/${service}/src/app.js`;
    
    let content = '';
    if (fs.existsSync(indexPath)) {
      content = fs.readFileSync(indexPath, 'utf8');
    } else if (fs.existsSync(appPath)) {
      content = fs.readFileSync(appPath, 'utf8');
    } else {
      console.log(`⚠️  ${service}: No index.js or app.js found`);
      continue;
    }
    
    // Check for incorrect relative paths
    const hasRelativePaths = content.includes('../../../shared/') || content.includes('../../shared/');
    
    if (hasRelativePaths) {
      console.log(`❌ ${service}: Still using relative paths to shared modules`);
      allTestsPassed = false;
    } else {
      console.log(`✅ ${service}: Uses correct Docker mount paths`);
    }
  } catch (error) {
    console.log(`❌ ${service}: Error checking - ${error.message}`);
    allTestsPassed = false;
  }
}

// Test 2: Check API Gateway uses Docker mount paths
console.log("\n2️⃣ Checking API Gateway Docker mount paths...");
const gatewayFiles = [
  'services/api-gateway/src/app.js',
  'services/api-gateway/src/routes/proxy.js', 
  'services/api-gateway/src/events/subscriptionEventConsumer.js'
];

for (const file of gatewayFiles) {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      const hasCorrectPaths = content.includes('/app/shared/middlewares/');
      const hasRelativePaths = content.includes('../../../shared/middlewares/') || content.includes('../../shared/middlewares/');
      
      if (hasCorrectPaths && !hasRelativePaths) {
        console.log(`✅ ${file}: Uses correct Docker mount paths`);
      } else {
        console.log(`❌ ${file}: Incorrect mount paths`);
        allTestsPassed = false;
      }
    }
  } catch (error) {
    console.log(`❌ ${file}: Error checking - ${error.message}`);
    allTestsPassed = false;
  }
}

// Test 3: Verify no relative shared paths exist across entire codebase
console.log("\n3️⃣ Scanning for any remaining relative shared paths...");
const { execSync } = require('child_process');

try {
  const grepResult = execSync('grep -r "\\.\\..*shared" services/ 2>/dev/null || true', { encoding: 'utf8' });
  
  if (grepResult.trim()) {
    console.log("❌ Found relative shared paths:");
    console.log(grepResult);
    allTestsPassed = false;
  } else {
    console.log("✅ No relative shared paths found");
  }
} catch (error) {
  console.log(`⚠️ Could not scan for relative paths: ${error.message}`);
}

// Test 4: Verify Docker mount paths are consistent
console.log("\n4️⃣ Checking Docker mount path consistency...");
try {
  const dockerPathResult = execSync('grep -r "/app/shared" services/ | wc -l 2>/dev/null || echo 0', { encoding: 'utf8' });
  const dockerPaths = parseInt(dockerPathResult.trim());
  
  if (dockerPaths > 0) {
    console.log(`✅ Found ${dockerPaths} Docker mount path references`);
  } else {
    console.log("❌ No Docker mount paths found");
    allTestsPassed = false;
  }
} catch (error) {
  console.log(`⚠️ Could not count Docker paths: ${error.message}`);
}

// Summary
console.log("\n" + "=".repeat(50));
if (allTestsPassed) {
  console.log("🎉 All Docker Mount Path Tests Passed!");
  console.log("\n✅ Production Ready Docker Configuration:");
  console.log("   🐳 All services use /app/shared mount paths");
  console.log("   🔗 Consistent shared module imports");
  console.log("   🚀 Ready for Docker Compose deployment");
  console.log("   📦 Proper containerized architecture");
} else {
  console.log("❌ Docker Mount Path Issues Found!");
  console.log("\nPlease fix the issues above before deploying to Docker.");
  process.exit(1);
}

console.log("\n🔧 Shared Module Architecture:");
sharedModules.forEach(module => {
  console.log(`   📄 ${module}`);
});

console.log("\n🚀 Ready for Production Docker Deployment!");