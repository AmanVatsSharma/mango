#!/usr/bin/env node

// scripts/run-auth-tests.js
const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Starting Authentication Flow Tests...\n');

try {
  // Set environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/tradingpro_test';
  
  // Run the tests
  const testCommand = 'npx jest tests/auth-flow.test.ts --verbose --detectOpenHandles --forceExit';
  
  console.log('📋 Running command:', testCommand);
  console.log('⏳ Please wait while tests are running...\n');
  
  execSync(testCommand, { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  console.log('\n✅ All authentication tests completed successfully!');
  console.log('🎯 Authentication system is working correctly.');
  
} catch (error) {
  console.error('\n❌ Test execution failed:');
  console.error(error.message);
  
  if (error.stdout) {
    console.log('\n📤 Test Output:');
    console.log(error.stdout.toString());
  }
  
  if (error.stderr) {
    console.log('\n📤 Test Errors:');
    console.log(error.stderr.toString());
  }
  
  console.log('\n🔧 Troubleshooting Tips:');
  console.log('1. Make sure your database is running');
  console.log('2. Check your DATABASE_URL environment variable');
  console.log('3. Ensure all dependencies are installed (npm install)');
  console.log('4. Run database migrations if needed (npx prisma migrate dev)');
  
  process.exit(1);
}
