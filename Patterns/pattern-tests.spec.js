/**
 * Pattern Detection Tests
 * Light tests to verify pattern structure and basic functionality
 * Tests shape-only detection without validation or confirmation
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
        const pattern = require(patternPath);
        patterns.push({
          file: file,
          dir: dir,
          pattern: pattern
        });
      });
    }
  });

  return patterns;
}

describe('Pattern Detection System', () => {
  const patterns = loadPatternFiles();

  test('All pattern files loaded successfully', () => {
    expect(patterns.length).toBeGreaterThan(0);
    console.log(`Loaded ${patterns.length} pattern files`);
  });

  patterns.forEach(({ file, dir, pattern }) => {
    describe(`${dir}/${file}`, () => {
      test('has detection function', () => {
        // Find the detection function (should be the first exported function)
        const detectionFunction = Object.values(pattern).find(
          value => typeof value === 'function' && value.name.startsWith('detect')
        );
        expect(detectionFunction).toBeDefined();
        expect(typeof detectionFunction).toBe('function');
      });

      test('has valid spec object', () => {
        expect(pattern.spec).toBeDefined();
        expect(typeof pattern.spec).toBe('object');
      });

      test('spec has required fields', () => {
        const spec = pattern.spec;
        expect(spec.name).toBeDefined();
        expect(spec.type).toBeDefined();
        expect(spec.minCandles).toBeDefined();
        expect(spec.shapeOnly).toBeDefined();
        expect(spec.description).toBeDefined();
        expect(spec.typicalPrediction).toBeDefined();
        expect(spec.commonContext).toBeDefined();
      });

      test('spec.shapeOnly is true', () => {
        expect(pattern.spec.shapeOnly).toBe(true);
      });

      test('spec.type matches directory', () => {
        const expectedType = dir.replace('-', '-');
        expect(pattern.spec.type).toBe(expectedType);
      });

      test('spec.minCandles is valid number', () => {
        expect(typeof pattern.spec.minCandles).toBe('number');
        expect(pattern.spec.minCandles).toBeGreaterThan(0);
      });

      test('detection function accepts minimum candles', () => {
        const detectionFunction = Object.values(pattern).find(
          value => typeof value === 'function' && value.name.startsWith('detect')
        );
        
        // Create mock candles array with minimum required candles
        const mockCandles = Array(pattern.spec.minCandles).fill({
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          timestamp: Date.now()
        });

        // Test that function can be called without errors
        expect(() => {
          const result = detectionFunction(mockCandles, 0);
          expect(result).toBeDefined();
          expect(typeof result).toBe('object');
          expect(result.hasOwnProperty('match')).toBe(true);
          expect(result.hasOwnProperty('confidence')).toBe(true);
          expect(result.hasOwnProperty('meta')).toBe(true);
        }).not.toThrow();
      });
    });
  });

  test('Pattern counts by type', () => {
    const typeCounts = patterns.reduce((acc, { pattern }) => {
      const type = pattern.spec.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    console.log('Pattern counts by type:', typeCounts);
    
    // Verify we have patterns for each expected type
    expect(typeCounts['chart-patterns']).toBeGreaterThan(0);
    expect(typeCounts['single-candle']).toBeGreaterThan(0);
    expect(typeCounts['double-candle']).toBeGreaterThan(0);
    expect(typeCounts['triple-candle']).toBeGreaterThan(0);
  });
});
