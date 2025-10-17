/**
 * Pattern Verification Script
 * Simple verification without Jest dependencies
 */

const fs = require('fs');
const path = require('path');

// Helper function to load all pattern files
function loadPatternFiles() {
  const patternDirs = ['chart-patterns', 'single-candle', 'double-candle', 'triple-candle'];
  const patterns = [];

  patternDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));
      files.forEach(file => {
        const patternPath = path.join(dirPath, file);
        try {
          const pattern = require(patternPath);
          patterns.push({
            file: file,
            dir: dir,
            pattern: pattern
          });
        } catch (error) {
          console.error(`Error loading ${file}:`, error.message);
        }
      });
    }
  });

  return patterns;
}

function verifyPatterns() {
  console.log('🔍 Verifying Pattern Detection System...\n');
  
  const patterns = loadPatternFiles();
  console.log(`✅ Loaded ${patterns.length} pattern files\n`);

  let totalTests = 0;
  let passedTests = 0;
  const errors = [];

  patterns.forEach(({ file, dir, pattern }) => {
    console.log(`Testing ${dir}/${file}...`);
    
    // Test 1: Detection function exists
    totalTests++;
    const detectionFunction = Object.values(pattern).find(
      value => typeof value === 'function' && value.name.startsWith('detect')
    );
    if (detectionFunction) {
      passedTests++;
      console.log('  ✅ Has detection function');
    } else {
      errors.push(`${file}: Missing detection function`);
      console.log('  ❌ Missing detection function');
    }

    // Test 2: Spec object exists
    totalTests++;
    if (pattern.spec && typeof pattern.spec === 'object') {
      passedTests++;
      console.log('  ✅ Has spec object');
    } else {
      errors.push(`${file}: Missing spec object`);
      console.log('  ❌ Missing spec object');
    }

    // Test 3: Spec has required fields
    totalTests++;
    if (pattern.spec) {
      const requiredFields = ['name', 'type', 'minCandles', 'shapeOnly', 'description', 'typicalPrediction', 'commonContext'];
      const hasAllFields = requiredFields.every(field => pattern.spec[field] !== undefined);
      if (hasAllFields) {
        passedTests++;
        console.log('  ✅ Has all required spec fields');
      } else {
        errors.push(`${file}: Missing required spec fields`);
        console.log('  ❌ Missing required spec fields');
      }
    }

    // Test 4: shapeOnly is true
    totalTests++;
    if (pattern.spec && pattern.spec.shapeOnly === true) {
      passedTests++;
      console.log('  ✅ shapeOnly is true');
    } else {
      errors.push(`${file}: shapeOnly is not true`);
      console.log('  ❌ shapeOnly is not true');
    }

    // Test 5: Type matches directory
    totalTests++;
    if (pattern.spec && pattern.spec.type === dir) {
      passedTests++;
      console.log('  ✅ Type matches directory');
    } else {
      errors.push(`${file}: Type does not match directory`);
      console.log('  ❌ Type does not match directory');
    }

    // Test 6: minCandles is valid
    totalTests++;
    if (pattern.spec && typeof pattern.spec.minCandles === 'number' && pattern.spec.minCandles > 0) {
      passedTests++;
      console.log('  ✅ minCandles is valid');
    } else {
      errors.push(`${file}: minCandles is not valid`);
      console.log('  ❌ minCandles is not valid');
    }

    // Test 7: Function accepts minimum candles
    totalTests++;
    if (detectionFunction) {
      try {
        const mockCandles = Array(pattern.spec.minCandles).fill({
          open: 100, high: 105, low: 95, close: 102, timestamp: Date.now()
        });
        
        const result = detectionFunction(mockCandles, 0);
        if (result && typeof result === 'object' && 
            result.hasOwnProperty('match') && 
            result.hasOwnProperty('confidence') && 
            result.hasOwnProperty('meta')) {
          passedTests++;
          console.log('  ✅ Function accepts minimum candles');
        } else {
          errors.push(`${file}: Function does not return correct structure`);
          console.log('  ❌ Function does not return correct structure');
        }
      } catch (error) {
        errors.push(`${file}: Function throws error: ${error.message}`);
        console.log('  ❌ Function throws error');
      }
    }

    console.log('');
  });

  // Summary
  console.log('📊 SUMMARY:');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

  // Pattern counts by type
  const typeCounts = patterns.reduce((acc, { pattern }) => {
    const type = pattern.spec.type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  console.log('📈 Pattern counts by type:');
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} patterns`);
  });
  console.log('');

  // Errors
  if (errors.length > 0) {
    console.log('❌ ERRORS:');
    errors.forEach(error => console.log(`  ${error}`));
    console.log('');
  }

  console.log('🎯 Expected pattern counts:');
  console.log('  chart-patterns: 18 patterns');
  console.log('  single-candle: 10 patterns');
  console.log('  double-candle: 5 patterns');
  console.log('  triple-candle: 8 patterns');
  console.log('  Total: 41 patterns\n');

  if (passedTests === totalTests && patterns.length === 41) {
    console.log('🎉 ALL TESTS PASSED! Pattern system is ready for implementation.');
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above.');
  }
}

// Run verification
verifyPatterns();
