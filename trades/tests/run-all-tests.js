#!/usr/bin/env node

const calculations = require('./calculations.test');
const integration = require('./integration.test');
const pdf = require('./pdf.test');

function runAllTests() {
  console.log('🧪 Running all tests for v6.6.2 fixes...\n');
  
  let allPassed = true;
  
  // Run calculation tests
  console.log('1️⃣ Running calculation tests...');
  if (!calculations.runAllTests()) {
    allPassed = false;
  }
  
  console.log('\n2️⃣ Running integration tests...');
  if (!integration.runIntegrationTests()) {
    allPassed = false;
  }
  
  console.log('\n3️⃣ Running PDF tests...');
  if (!pdf.runPDFTests()) {
    allPassed = false;
  }
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED! Ready to fix the code.');
  } else {
    console.log('❌ Some tests failed. Fix the issues first.');
    process.exit(1);
  }
  
  return allPassed;
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
