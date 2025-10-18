/**
 * Pattern Backtest System - Enhanced Version
 * 
 * STAGE 2: Historical data ingestion, Redis storage, pattern scanning, and beautiful PDF reporting
 */

// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Redis = require('redis');

/**
 * Format date to YYYY-MM-DD HH:MM:SS (24h format)
 */
function formatDateTime24h(dateString) {
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Format to YYYY-MM-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    // If parsing fails, return original string
    return dateString;
  }
}
const PDFDocument = require('pdfkit');
const { backtestPatternDetections, generateBacktestStats, generateBacktestReport } = require('./pattern-backtester');

// Redis client
let redisClient = null;

/**
 * ORIGINAL COMPREHENSIVE BACKTEST PROCESS
 */

async function runPatternBacktest(forceRefresh = false) {
  console.log('Starting Enhanced Pattern Detection Backtest...');
  
  try {
    // STEP 1: Initialize Redis connection
    await initializeRedis();
    
    // STEP 2: Check if data exists in Redis (unless forced refresh)
    let candles = null;
    
    if (forceRefresh) {
      console.log('🔄 Force refresh enabled, bypassing cache...');
    } else {
      console.log('🔍 Checking Redis cache for existing data...');
      candles = await getCandlesFromRedis();
    }
    
    if (!candles) {
      // STEP 3: Historical Data Ingestion (only if not in cache or forced)
      console.log('📊 Fetching fresh historical data from Binance...');
      candles = await fetchHistoricalDataWithValidation();
      
      // STEP 4: Store in Redis with TTL
      console.log('💾 Storing candles in Redis with 2-hour TTL...');
    await storeCandlesInRedis(candles);
    } else {
      console.log('Using cached data, skipping API calls');
    }
    
    // STEP 5: Load pattern detectors
    console.log('🔍 Loading pattern detectors...');
    const detectors = await loadPatternDetectors();
    
    // STEP 6: Scan for patterns
    console.log(`🔎 Scanning for patterns in ${candles.length} historical candles...`);
    const detections = await scanAllPatterns(candles, detectors);
    
    // STEP 7: Generate beautiful PDF reports by category
    console.log('📄 Generating beautiful PDF reports...');
    await generateCategoryReports(detections);
    
    // STEP 8: Generate main summary report
    console.log('📊 Generating main summary report...');
    await generateMainSummaryReport(detections, candles.length);
    
    // STEP 9: Run backtesting for Marubozu pattern
    console.log('🎯 Running backtesting for Marubozu pattern...');
    await runMarubozuBacktest(detections, candles);
    
    // STEP 10: Console summary
    console.log('✅ Enhanced backtest completed successfully!');
    console.log('📊 Summary:');
    console.log(`Total patterns detected: ${detections.length}`);
    
    // Group by type
    const typeCounts = detections.reduce((acc, detection) => {
      acc[detection.type] = (acc[detection.type] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Pattern counts by type:');
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} detections`);
    });
    
    // Top 10 patterns
    const patternCounts = detections.reduce((acc, detection) => {
      acc[detection.name] = (acc[detection.name] || 0) + 1;
      return acc;
    }, {});
    
    const topPatterns = Object.entries(patternCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    console.log('Top 10 most detected patterns:');
    topPatterns.forEach(([name, count], index) => {
      console.log(`  ${index + 1}. ${name}: ${count} detections`);
    });
    
  } catch (error) {
    console.error('❌ Backtest failed:', error.message);
    throw error;
  } finally {
    if (redisClient) {
      await redisClient.quit();
    }
  }
}

/**
 * SIMPLIFIED MARUBOZU BACKTEST PROCESS
 */

async function runMarubozuBacktestOnly(forceRefresh = false) {
  console.log('Starting Simplified Marubozu Pattern Detection...');
  
  try {
    // STEP 1: Initialize Redis connection
    await initializeRedis();
    
    // STEP 2: Check if data exists in Redis (unless forced refresh)
    let candles = null;
    
    if (forceRefresh) {
      console.log('🔄 Force refresh enabled, bypassing cache...');
    } else {
      console.log('🔍 Checking Redis cache for existing data...');
      candles = await getCandlesFromRedis();
    }
    
    if (!candles) {
      // STEP 3: Historical Data Ingestion (only if not in cache or forced)
      console.log('📊 Fetching fresh historical data from Binance...');
      candles = await fetchHistoricalDataWithValidation();
      
      // STEP 4: Store in Redis WITHOUT TTL (permanent cache)
      console.log('💾 Storing candles in Redis WITHOUT TTL...');
      await storeCandlesInRedisPermanent(candles);
    } else {
      console.log('Using cached data, skipping API calls');
    }
    
    // STEP 5: Load ALL pattern detectors
    console.log('🔍 Loading ALL pattern detectors...');
    const detectors = await loadPatternDetectors();
    
    // STEP 6: Scan for ALL patterns
    console.log(`🔎 Scanning for ALL patterns in ${candles.length} historical candles...`);
    const allDetections = await scanAllPatterns(candles, detectors);
    
    // STEP 7: Filter only Marubozu patterns for report
    // STEP 7: Generate pattern reports by category
    console.log('📄 Generating pattern reports...');
    await generateCategoryReports(allDetections);
    
    // STEP 8: Console summary
    console.log('✅ Pattern detection completed successfully!');
    console.log(`📊 Total patterns found: ${allDetections.length}`);
    
    // Count patterns by type
    const patternCounts = {};
    allDetections.forEach(detection => {
      patternCounts[detection.type] = (patternCounts[detection.type] || 0) + 1;
    });
    
    console.log('\n📈 Pattern counts by type:');
    Object.entries(patternCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} detections`);
    });
    
  } catch (error) {
    console.error('❌ Marubozu backtest failed:', error.message);
    throw error;
  } finally {
    if (redisClient) {
      await redisClient.quit();
    }
  }
}

/**
 * HELPER FUNCTIONS IMPLEMENTATION
 */

/**
 * Data Ingestion Functions
 */
async function initializeRedis() {
  redisClient = Redis.createClient({
    host: 'localhost',
    port: 6379,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  });
  
  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });
  
  await redisClient.connect();
  console.log('✅ Connected to Redis');
}

async function fetchHistoricalDataWithValidation() {
  const symbol = 'ETHUSDT';
  const interval = '15m';
  const limit = 1000; // 1000 candles per request (Binance limit)
  const totalCandles = 100000; // Total target: 100k candles
  const iterations = 100; // 100 iterations * 1000 = 100000
  
  let allCandles = [];
  let duplicatesFound = 0;
  let invalidCandles = 0;
  
  // Get current time in Peru (GMT-5)
  const nowPeru = new Date();
  const peruOffset = -5 * 60; // Peru is GMT-5
  const peruTime = new Date(nowPeru.getTime() + (peruOffset * 60 * 1000));
  let endTime = peruTime.getTime(); // Start from current Peru time
  
  console.log(`🇵🇪 Starting from current Peru time: ${peruTime.toISOString()}`);
  console.log(`📈 Fetching ${totalCandles} candles in ${iterations} batches...`);
  
  for (let i = 0; i < iterations; i++) {
    console.log(`  Batch ${i + 1}/${iterations}... (${(i + 1) * 1000} candles so far)`);
    
    try {
      const url = `https://fapi.binance.com/fapi/v1/klines`;
      const params = {
        symbol,
        interval,
        limit,
        endTime
      };
      
      const response = await axios.get(url, { params });
      const rawCandles = response.data.map(kline => ({
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        timestamp: parseInt(kline[0]),
        openTime: new Date(parseInt(kline[0]))
      }));
      
      // Simple validation - just check OHLC validity, no temporal validation yet
      const validCandles = [];
      
      for (const candle of rawCandles) {
        // Validate candle data
        if (!candle.open || !candle.high || !candle.low || !candle.close || !candle.timestamp) {
          invalidCandles++;
          continue;
        }
        
        // Validate OHLC relationships
        if (candle.high < candle.low || candle.high < candle.open || candle.high < candle.close ||
            candle.low > candle.open || candle.low > candle.close) {
          invalidCandles++;
          continue;
        }
        
        validCandles.push(candle);
      }
      
      // Add all valid candles to our array (we'll sort later)
      allCandles = allCandles.concat(validCandles);
      
      // Set endTime for next batch using the oldest candle from this batch
      if (validCandles.length > 0) {
        // Find the oldest candle (smallest timestamp) in this batch
        const oldestCandle = validCandles.reduce((oldest, current) => 
          current.timestamp < oldest.timestamp ? current : oldest
        );
        endTime = oldestCandle.timestamp - 1;
      }
      
      console.log(`    ✅ Fetched ${validCandles.length} valid candles (${rawCandles.length - validCandles.length} filtered)`);
      
      // Cooldown between requests
      if (i < iterations - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`    ❌ Error fetching batch ${i + 1}:`, error.message);
      throw error;
    }
  }
  
  // Final validation and sorting
  console.log(`🔍 Final validation and sorting of ${allCandles.length} candles...`);
  
  // Sort all candles by timestamp (oldest first)
  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  
  // Remove only exact timestamp duplicates
  const finalCandles = [];
  const seenTimestamps = new Set();
  
  for (const candle of allCandles) {
    if (!seenTimestamps.has(candle.timestamp)) {
      finalCandles.push(candle);
      seenTimestamps.add(candle.timestamp);
    } else {
      duplicatesFound++;
    }
  }
  
  console.log(`✅ Total candles fetched: ${allCandles.length}`);
  console.log(`📊 Quality report:`);
  console.log(`   - Invalid candles filtered: ${invalidCandles}`);
  console.log(`   - Exact duplicates removed: ${duplicatesFound}`);
  console.log(`   - Final unique candles: ${finalCandles.length}`);
  
  return finalCandles;
}

// Keep the old function for backward compatibility
async function fetchHistoricalData() {
  return await fetchHistoricalDataWithValidation();
}

async function storeCandlesInRedis(candles) {
  const key = 'ETHUSD_HISTORICAL_CANDLES';
  const ttlSeconds = 2 * 60 * 60; // 2 hours in seconds
  await redisClient.setEx(key, ttlSeconds, JSON.stringify(candles));
  console.log(`✅ Stored ${candles.length} candles in Redis under key: ${key} (TTL: 2 hours)`);
}

async function storeCandlesInRedisPermanent(candles) {
  const key = 'ETHUSD_HISTORICAL_CANDLES_PERMANENT';
  await redisClient.set(key, JSON.stringify(candles));
  console.log(`✅ Stored ${candles.length} candles in Redis under key: ${key} (NO TTL - Permanent)`);
}

async function getCandlesFromRedis() {
  // First try permanent cache, then temporary cache
  const permanentKey = 'ETHUSD_HISTORICAL_CANDLES_PERMANENT';
  const tempKey = 'ETHUSD_HISTORICAL_CANDLES';
  
  try {
    // Try permanent cache first
    let data = await redisClient.get(permanentKey);
    if (data) {
      const candles = JSON.parse(data);
      console.log(`✅ Found ${candles.length} candles in Redis permanent cache`);
      return candles;
    }
    
    // Try temporary cache
    data = await redisClient.get(tempKey);
    if (data) {
      const candles = JSON.parse(data);
      console.log(`✅ Found ${candles.length} candles in Redis temporary cache`);
      return candles;
    }
    
    return null;
  } catch (error) {
    console.error('Error reading from Redis:', error.message);
    return null;
  }
}

/**
 * Pattern Loading Functions
 */
async function loadMarubozuDetector() {
  const marubozuPath = path.join(__dirname, '..', 'single-candle', 'marubozu.js');
  
  try {
    const pattern = require(marubozuPath);
    
    // Find the detection function
    const detectionFunction = Object.values(pattern).find(
      value => typeof value === 'function' && value.name.startsWith('detect')
    );
    
    if (detectionFunction && pattern.spec) {
      console.log('✅ Loaded Marubozu detector');
      return {
        name: pattern.spec.name,
        type: pattern.spec.type,
        minCandles: pattern.spec.minCandles,
        detect: detectionFunction,
        spec: pattern.spec
      };
    }
    
    throw new Error('Marubozu detector not found or invalid');
  } catch (error) {
    console.error('Error loading Marubozu detector:', error.message);
    throw error;
  }
}

async function loadPatternDetectors() {
  const detectors = {
    'single-candle': [],
    'double-candle': [],
    'triple-candle': [],
    'chart-patterns': []
  };
  
  const patternDirs = ['single-candle', 'double-candle', 'triple-candle', 'chart-patterns'];
  
  for (const dir of patternDirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));
      
      for (const file of files) {
        try {
          const patternPath = path.join(dirPath, file);
          const pattern = require(patternPath);
          
          // Find the detection function
          const detectionFunction = Object.values(pattern).find(
            value => typeof value === 'function' && value.name.startsWith('detect')
          );
          
          if (detectionFunction && pattern.spec) {
            detectors[dir].push({
              name: pattern.spec.name,
              type: pattern.spec.type,
              minCandles: pattern.spec.minCandles,
              detect: detectionFunction,
              spec: pattern.spec
            });
          }
        } catch (error) {
          console.error(`Error loading ${dir}/${file}:`, error.message);
        }
      }
    }
  }
  
  console.log(`✅ Loaded pattern detectors:`);
  Object.entries(detectors).forEach(([type, patterns]) => {
    console.log(`  ${type}: ${patterns.length} patterns`);
  });
  
  return detectors;
}

/**
 * Pattern Scanning Functions
 */
async function scanMarubozuPatterns(candles, marubozuDetector) {
  const detections = [];
  
  console.log(`🔍 Scanning ${candles.length} candles for Marubozu patterns...`);
  
  for (let i = 0; i < candles.length; i++) {
    try {
      const result = marubozuDetector.detect(candles, i);
      if (result.match) {
        detections.push({
          name: marubozuDetector.name,
          type: marubozuDetector.type,
          index: i,
          timestampLocal: convertTimestampToLima(candles[i].timestamp),
          confidence: result.confidence,
          meta: result.meta,
          typicalPrediction: marubozuDetector.spec.typicalPrediction,
          commonContext: marubozuDetector.spec.commonContext,
          candle: candles[i]
        });
      }
    } catch (error) {
      // Skip problematic candles
    }
  }
  
  console.log(`✅ Found ${detections.length} Marubozu patterns`);
  return detections;
}

async function scanAllPatterns(candles, detectors) {
  const detections = [];
  const chunkSize = 50000; // Process in chunks of 50k candles
  
  // Load environment variables for scanning control
  const scanSingle = process.env.SCAN_SINGLE === 'true' || process.env.SCAN_SINGLE === undefined;
  const scanDouble = process.env.SCAN_DOUBLE === 'true' || process.env.SCAN_DOUBLE === undefined;
  const scanTriple = process.env.SCAN_TRIPLE === 'true' || process.env.SCAN_TRIPLE === undefined;
  const scanChart = process.env.SCAN_CHART === 'true' || process.env.SCAN_CHART === undefined;
  
  // Load MAX_QTY environment variable
  const maxQty = process.env.MAX_QTY;
  let candlesToProcess = candles;
  
  if (maxQty && maxQty !== '0' && maxQty.toLowerCase() !== 'infinity') {
    const maxQtyNum = parseInt(maxQty);
    if (!isNaN(maxQtyNum) && maxQtyNum > 0) {
      // Take the LAST maxQtyNum candles instead of the first ones
      candlesToProcess = candles.slice(-maxQtyNum);
      console.log(`🔢 MAX_QTY limit applied: processing LAST ${candlesToProcess.length} candles (from ${candles.length} total)`);
      console.log(`📅 Date range: ${new Date(candlesToProcess[0].timestamp).toLocaleString()} to ${new Date(candlesToProcess[candlesToProcess.length - 1].timestamp).toLocaleString()}`);
    }
  } else if (maxQty === '0' || maxQty.toLowerCase() === 'infinity') {
    console.log(`🔢 MAX_QTY set to ${maxQty}: processing ALL ${candles.length} candles`);
  }
  
  console.log(`📊 Processing ${candlesToProcess.length} candles in chunks of ${chunkSize}...`);
  console.log(`🔧 Scanning configuration:`);
  console.log(`   Single-candle: ${scanSingle ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   Double-candle: ${scanDouble ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   Triple-candle: ${scanTriple ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   Chart patterns: ${scanChart ? '✅ ENABLED' : '❌ DISABLED'}`);
  
  for (let i = 0; i < candlesToProcess.length; i += chunkSize) {
    const chunk = candlesToProcess.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(candlesToProcess.length / chunkSize);
    const startIndex = i; // Global start index for this chunk
    
    console.log(`  🔍 Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} candles, global index ${startIndex}-${startIndex + chunk.length - 1})...`);
    
    let chunkDetections = 0;
    
    // Scan single-candle patterns
    if (scanSingle) {
      console.log('    Scanning single-candle patterns...');
      const singleDetections = await scanSingleCandlePatterns(chunk, detectors['single-candle'], startIndex);
      detections.push(...singleDetections);
      chunkDetections += singleDetections.length;
    } else {
      console.log('    ⏭️  Skipping single-candle patterns (disabled)');
    }
    
    // Scan double-candle patterns
    if (scanDouble) {
      console.log('    Scanning double-candle patterns...');
      const doubleDetections = await scanDoubleCandlePatterns(chunk, detectors['double-candle'], startIndex);
      detections.push(...doubleDetections);
      chunkDetections += doubleDetections.length;
    } else {
      console.log('    ⏭️  Skipping double-candle patterns (disabled)');
    }
    
    // Scan triple-candle patterns
    if (scanTriple) {
      console.log('    Scanning triple-candle patterns...');
      const tripleDetections = await scanTripleCandlePatterns(chunk, detectors['triple-candle'], startIndex);
      detections.push(...tripleDetections);
      chunkDetections += tripleDetections.length;
    } else {
      console.log('    ⏭️  Skipping triple-candle patterns (disabled)');
    }
    
    // Scan chart patterns
    if (scanChart) {
      console.log('    Scanning chart patterns...');
      const chartDetections = await scanChartPatterns(chunk, detectors['chart-patterns'], startIndex);
      detections.push(...chartDetections);
      chunkDetections += chartDetections.length;
    } else {
      console.log('    ⏭️  Skipping chart patterns (disabled)');
    }
    
    console.log(`    ✅ Chunk ${chunkNumber}/${totalChunks} completed (${chunkDetections} detections)`);
  }
  
  return detections;
}

// Pattern priority function (higher number = higher priority)
function getPatternPriority(patternName) {
  const priorities = {
    // Doji patterns (highest priority - most specific)
    'dragonfly-doji': 100,
    'gravestone-doji': 100,
    'long-legged-doji': 100,
    'doji': 90,
    
    // Hammer/Hanging Man patterns (high priority)
    'hammer': 80,
    'hanging-man': 80,
    'inverted-hammer': 80,
    'shooting-star': 80,
    
    // Other single candle patterns (medium priority)
    'marubozu': 70,
    'spinning-top': 60
  };
  
  return priorities[patternName] || 50;
}

async function scanSingleCandlePatterns(candles, detectors, startIndex = 0) {
  const detections = [];
  
  for (let i = 0; i < candles.length; i++) {
    let bestMatch = null;
    let bestPriority = 0;
    
    // Check all patterns and find the highest priority match
    for (const detector of detectors) {
      try {
        const result = detector.detect(candles, i);
        if (result.match) {
          const priority = getPatternPriority(detector.name);
          
          // Only keep the highest priority pattern for this candle
          if (priority > bestPriority) {
            bestPriority = priority;
            bestMatch = {
            name: detector.name,
            type: detector.type,
            index: startIndex + i, // Use global index
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
              commonContext: detector.spec.commonContext,
              candle: candles[i]
            };
          }
        }
      } catch (error) {
        // Skip problematic patterns
      }
    }
    
    // Add the best match if found
    if (bestMatch) {
      detections.push(bestMatch);
    }
  }
  
  return detections;
}

async function scanDoubleCandlePatterns(candles, detectors, startIndex = 0) {
  const detections = [];
  
  for (let i = 0; i < candles.length - 1; i++) {
    for (const detector of detectors) {
      try {
        const result = detector.detect(candles, i);
        if (result.match) {
          detections.push({
            name: detector.name,
            type: detector.type,
            index: startIndex + i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext,
            candle: candles[i] // Add candle data
          });
        }
      } catch (error) {
        // Skip problematic patterns
      }
    }
  }
  
  return detections;
}

async function scanTripleCandlePatterns(candles, detectors, startIndex = 0) {
  const detections = [];
  
  for (const detector of detectors) {
    const patternDetections = [];
    
    for (let i = 0; i < candles.length - detector.minCandles + 1; i++) {
      try {
        const result = detector.detect(candles, i);
        if (result.match) {
          const detection = {
            name: detector.name,
            type: detector.type,
            index: startIndex + i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext,
            candle: candles[i] // Add candle data
          };
          
          // Special logic for Three White Soldiers - add next 5 candles data
          if (detector.name === 'three-white-soldiers' && i + 5 < candles.length) {
            detection.nextCandles = [
              candles[i + 1],
              candles[i + 2], 
              candles[i + 3],
              candles[i + 4],
              candles[i + 5]
            ];
          }
          
          patternDetections.push(detection);
        }
      } catch (error) {
        // Skip problematic patterns
      }
    }
    
    // Apply temporal duplicate filtering for all triple-candle patterns
    if (patternDetections.length > 0) {
      try {
        const patternFile = detector.name.replace(/-/g, '-');
        const { filterTemporalDuplicates } = require(`../triple-candle/${patternFile}`);
        const filteredDetections = filterTemporalDuplicates(patternDetections);
        detections.push(...filteredDetections);
      } catch (error) {
        // If no filtering function exists, use original detections
        detections.push(...patternDetections);
      }
    }
  }
  
  return detections;
}

async function scanChartPatterns(candles, detectors, startIndex = 0) {
  const detections = [];
  
  console.log(`    📊 Scanning ${detectors.length} chart pattern detectors...`);
  
  for (const detector of detectors) {
    const windowSize = detector.minCandles || 50;
    console.log(`      🔍 Checking ${detector.name} (window: ${windowSize})...`);
    
    let patternMatches = 0;
    for (let i = 0; i < candles.length - windowSize + 1; i++) {
      try {
        const result = detector.detect(candles, i, windowSize);
        if (result.match) {
          patternMatches++;
          detections.push({
            name: detector.name,
            type: detector.type,
            index: startIndex + i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext,
            candle: candles[i] // Add candle data for chart patterns
          });
        }
      } catch (error) {
        console.log(`        ❌ Error in ${detector.name}: ${error.message}`);
      }
    }
    
    console.log(`        ✅ ${detector.name}: ${patternMatches} matches`);
  }
  
  console.log(`    📈 Total chart patterns detected: ${detections.length}`);
  return detections;
}

/**
 * Simple Marubozu Report Generation
 */
async function generateMarubozuCandleReport(marubozuDetections) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
  
  const reportsDir = path.join(__dirname, '..', 'Reports', 'single-candle', 'marubozu');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const filename = 'marubozu-candle-report.pdf';
  const filepath = path.join(reportsDir, filename);
  
  doc.pipe(fs.createWriteStream(filepath));
  
  // Header
  doc.rect(0, 0, doc.page.width, 80)
     .fill('#2c3e50');
  
  doc.fillColor('#ffffff')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text('MARUBOZU CANDLE REPORT', 50, 30);
  
  doc.fillColor('#ecf0f1')
     .fontSize(12)
     .font('Helvetica')
     .text(`Total Marubozu Candles Found: ${marubozuDetections.length}`, 50, 55);
  
  let y = 100;
  
  // Summary info
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('SUMMARY', 50, y);
  
  y += 30;
  
  const bullishCount = marubozuDetections.filter(d => d.candle.close > d.candle.open).length;
  const bearishCount = marubozuDetections.filter(d => d.candle.close < d.candle.open).length;
  
  doc.fillColor('#27ae60')
     .fontSize(12)
     .font('Helvetica-Bold')
     .text(`Bullish Marubozu: ${bullishCount}`, 70, y);
  
  y += 20;
  doc.fillColor('#e74c3c')
     .fontSize(12)
     .font('Helvetica-Bold')
     .text(`Bearish Marubozu: ${bearishCount}`, 70, y);
  
  y += 40;
  
  // Detailed candle list
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('MARUBOZU CANDLE LOCATIONS', 50, y);
  
  y += 30;
  
  // Sort by index
  const sortedDetections = marubozuDetections.sort((a, b) => b.index - a.index); // Más actual primero
  
  for (let i = 0; i < sortedDetections.length; i++) {
    const detection = sortedDetections[i];
    const candle = detection.candle;
    const isBullish = candle.close > candle.open;
    
    // Detection box - taller for better layout
    doc.rect(50, y, doc.page.width - 100, 115)
       .fill(isBullish ? '#e8f5e8' : '#ffeaea')
       .stroke(isBullish ? '#27ae60' : '#e74c3c');
    
    // Detection number and direction
    doc.fillColor('#6c757d')
       .fontSize(10)
       .font('Helvetica')
       .text(`#${i + 1}`, 60, y + 10);
    
    doc.fillColor(isBullish ? '#27ae60' : '#e74c3c')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(`${isBullish ? 'BULLISH' : 'BEARISH'} MARUBOZU`, 80, y + 10);
    
    // Index
    doc.fillColor('#495057')
       .fontSize(10)
       .font('Helvetica')
       .text(`Index: ${detection.index}`, 60, y + 25);
    
    // Times in clean format
    doc.fillColor('#495057').fontSize(9).font('Helvetica').text(`Peru: ${convertTimestampToLima(detection.candle.timestamp)}`, 60, y + 40);
    doc.fillColor('#495057').fontSize(9).font('Helvetica').text(`Mexico: ${convertTimestampToMexico(detection.candle.timestamp)}`, 60, y + 50);
    
    // OHLC data in organized columns
    doc.text(`Open: $${candle.open.toFixed(2)}`, 200, y + 25);
    doc.text(`Close: $${candle.close.toFixed(2)}`, 200, y + 40);
    
    doc.text(`High: $${candle.high.toFixed(2)}`, 320, y + 25);
    doc.text(`Low: $${candle.low.toFixed(2)}`, 320, y + 40);
    
    // Volume and confidence
    doc.text(`Volume: ${candle.volume.toLocaleString()}`, 440, y + 25);
    doc.fillColor('#7f8c8d')
       .fontSize(10)
       .font('Helvetica')
       .text(`Confidence: ${(detection.confidence * 100).toFixed(1)}%`, 440, y + 40);
    
    // Prediction and context
    doc.fillColor('#28a745')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text(`Prediction: ${detection.typicalPrediction}`, 60, y + 75);
    
    doc.fillColor('#6c757d')
       .fontSize(9)
       .font('Helvetica')
       .text(`Context: ${detection.commonContext}`, 60, y + 90);
    
    y += 130;
    
    // Pagination
    if (y > 650) {
      doc.addPage();
      y = 50;
    }
  }
  
  // Footer
  try {
    const pageRange = doc.bufferedPageRange();
    if (pageRange && pageRange.count > 0) {
      const startPage = pageRange.start || 0;
      const pageCount = pageRange.count;
      
      for (let i = startPage; i < startPage + pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fillColor('#95a5a6')
           .fontSize(8)
           .font('Helvetica')
           .text(`Page ${i - startPage + 1} of ${pageCount}`, 50, doc.page.height - 30);
        
        doc.text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })}`, 
                 doc.page.width - 200, doc.page.height - 30);
      }
    }
  } catch (error) {
    console.log('Could not add footer to PDF:', error.message);
  }
  
  doc.end();
  console.log(`✅ Generated Marubozu candle report: ${filepath}`);
}

/**
 * Beautiful PDF Generation Functions - Individual Pattern Reports
 */
async function generateCategoryReports(detections) {
  const categories = ['single-candle', 'double-candle', 'triple-candle', 'chart-patterns'];
  
  // Generate individual pattern reports
  for (const category of categories) {
    const categoryDetections = detections.filter(d => d.type === category);
    if (categoryDetections.length > 0) {
      // Group detections by pattern name
      const patternGroups = categoryDetections.reduce((acc, detection) => {
        if (!acc[detection.name]) {
          acc[detection.name] = [];
        }
        acc[detection.name].push(detection);
        return acc;
      }, {});
      
      // Generate individual report for each pattern
      for (const [patternName, patternDetections] of Object.entries(patternGroups)) {
        await generateIndividualPatternPDF(category, patternName, patternDetections);
      }
      
      // Generate category summary report
      await generateCategorySummaryPDF(category, categoryDetections);
    }
  }
}

// Generate individual pattern report
async function generateIndividualPatternPDF(category, patternName, detections) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
  
  const categoryDir = path.join(__dirname, '..', 'Reports', category);
  
  // Create pattern subfolders for all categories including single-candle
  const patternDir = path.join(categoryDir, patternName);
  if (!fs.existsSync(patternDir)) {
    fs.mkdirSync(patternDir, { recursive: true });
  }
  
  const filename = `${patternName}-report.pdf`;
  const filepath = path.join(patternDir, filename);
  
  doc.pipe(fs.createWriteStream(filepath));
  
  // Header with gradient-like effect
  doc.rect(0, 0, doc.page.width, 80)
     .fill('#2c3e50');
  
  // Special title for Three White Soldiers
  if (patternName === 'three-white-soldiers') {
    doc.fillColor('#ffffff')
       .fontSize(20)
       .font('Helvetica-Bold')
       .text('THREE WHITE SOLDIERS', 50, 20);
    
    doc.fillColor('#f39c12')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text('Tests 10X/50X Leverage • Capital $400 • Notional $4,000/$2,000', 50, 45);
    
    doc.fillColor('#ecf0f1')
       .fontSize(12)
       .font('Helvetica')
       .text(`Pattern Type: ${category}`, 50, 65);
  } else {
    doc.fillColor('#ffffff')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text(patternName.replace(/-/g, ' ').toUpperCase(), 50, 30);
    
    doc.fillColor('#ecf0f1')
       .fontSize(12)
       .font('Helvetica')
       .text(`Pattern Type: ${category}`, 50, 55);
  }
  
  // Pattern info box
  let y = 100;
  
  doc.rect(50, y, doc.page.width - 100, 60)
     .fill('#ecf0f1');
  
  doc.fillColor('#2c3e50')
     .fontSize(14)
     .font('Helvetica-Bold')
     .text('PATTERN INFORMATION', 70, y + 10);
  
  y += 25;
  
  doc.fillColor('#34495e')
     .fontSize(11)
     .font('Helvetica')
     .text(`Total Detections: ${detections.length}`, 70, y);
  
  y += 15;
  
  doc.text(`Description: ${detections[0].commonContext}`, 70, y);
  
  y += 30;
  
  // Detailed detections
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text(`DETAILED DETECTIONS (${detections.length})`, 50, y);
  
  y += 30;
  
  // Sort detections by timestamp
  const sortedDetections = detections.sort((a, b) => b.index - a.index); // Más actual primero
  
  for (let i = 0; i < sortedDetections.length; i++) {
    const detection = sortedDetections[i];
    
    // Detection box - taller to accommodate better layout including next candles analysis
    const boxHeight = patternName === 'three-white-soldiers' && detection.nextCandles ? 180 : 115;
    doc.rect(50, y, doc.page.width - 100, boxHeight)
       .fill('#f8f9fa');
    
    doc.rect(50, y, doc.page.width - 100, boxHeight)
       .stroke('#dee2e6');
    
    // Detection number
    doc.fillColor('#6c757d')
       .fontSize(10)
       .font('Helvetica')
       .text(`#${i + 1}`, 60, y + 10);
    
    // Index
    doc.fillColor('#495057')
       .fontSize(10)
       .font('Helvetica')
       .text(`Index: ${detection.index}`, 80, y + 10);
    
    // Times in a clean column
    doc.fillColor('#495057').fontSize(9).font('Helvetica').text(`Peru: ${convertTimestampToLima(detection.candle.timestamp)}`, 60, y + 25);
    doc.fillColor('#495057').fontSize(9).font('Helvetica').text(`Mexico: ${convertTimestampToMexico(detection.candle.timestamp)}`, 60, y + 35);
    
    // OHLC data in organized columns
    doc.text(`Open: $${detection.candle.open.toFixed(2)}`, 200, y + 25);
    doc.text(`Close: $${detection.candle.close.toFixed(2)}`, 200, y + 40);
    
    doc.text(`High: $${detection.candle.high.toFixed(2)}`, 320, y + 25);
    doc.text(`Low: $${detection.candle.low.toFixed(2)}`, 320, y + 40);
    
    // Volume
    doc.text(`Volume: ${detection.candle.volume.toLocaleString()}`, 440, y + 25);
    
    // Confidence
    doc.fillColor('#7f8c8d')
       .fontSize(10)
       .font('Helvetica')
       .text(`Confidence: ${(detection.confidence * 100).toFixed(1)}%`, 440, y + 40);
    
    // Removed prediction, context, and direction text
    
    // Special logic for Three White Soldiers - Next 5 candles analysis
    if (patternName === 'three-white-soldiers' && detection.nextCandles) {
      const nextCandles = detection.nextCandles;
      const signalClose = detection.candle.close;
      
      // Find the highest high and lowest low across all 5 next candles
      let maxHigh = 0;
      let minLow = Infinity;
      let maxHighCandleIndex = -1;
      let minLowCandleIndex = -1;
      
      for (let j = 0; j < nextCandles.length; j++) {
        const candle = nextCandles[j];
        if (candle.high > maxHigh) {
          maxHigh = candle.high;
          maxHighCandleIndex = j + 1; // +1 because we want candle number (1st, 2nd, 3rd, 4th, 5th)
        }
        if (candle.low < minLow) {
          minLow = candle.low;
          minLowCandleIndex = j + 1; // +1 because we want candle number (1st, 2nd, 3rd, 4th, 5th)
        }
      }
      
      // Calculate percentage changes
      const maxRisePercent = ((maxHigh - signalClose) / signalClose) * 100;
      const maxFallPercent = ((minLow - signalClose) / signalClose) * 100;
      
      // TP/SL Analysis
      const tp10x = 1.5; // 1.5% TP for 10X
      const tp50x = 1.0; // 1.0% TP for 50X
      const sl10x = 0.8; // 0.8% SL for 10X
      const sl50x = 0.5; // 0.5% SL for 50X
      
      const tpReached10x = maxRisePercent >= tp10x;
      const tpReached50x = maxRisePercent >= tp50x;
      const slReached10x = maxFallPercent <= -sl10x;
      const slReached50x = maxFallPercent <= -sl50x;
      
      // Removed NEXT 5 CANDLES ANALYSIS text and individual Max Rise/Max Fall
      
      // Calculate perfect spacing for 3 blocks
      const containerWidth = doc.page.width - 120; // Total available width (60px margins on each side)
      const blockSpacing = 15; // Space between blocks
      const blockWidth = (containerWidth - (blockSpacing * 2)) / 3; // Perfect 1/3 division
      const blockHeight = 80;
      const blockY = y + 60;
      
      // Block 1: TP/SL Analysis
      const block1X = 60;
      doc.rect(block1X, blockY, blockWidth, blockHeight)
         .fill('#f8f9fa')
         .stroke('#2c3e50')
         .lineWidth(1);
      
      doc.fillColor('#2c3e50')
         .fontSize(9)
         .font('Helvetica-Bold')
         .text(`TP/SL ANALYSIS`, block1X + 10, blockY + 10);
      
      doc.fillColor(tpReached10x ? '#27ae60' : '#e74c3c')
         .fontSize(8)
         .font('Helvetica')
         .text(`10X TP (${tp10x}%): ${tpReached10x ? 'YES' : 'NO'}`, block1X + 10, blockY + 25);
      
      doc.fillColor(slReached10x ? '#e74c3c' : '#27ae60')
         .fontSize(8)
         .font('Helvetica')
         .text(`10X SL (${sl10x}%): ${slReached10x ? 'YES' : 'NO'}`, block1X + 10, blockY + 40);
      
      doc.fillColor(tpReached50x ? '#27ae60' : '#e74c3c')
         .fontSize(8)
         .font('Helvetica')
         .text(`50X TP (${tp50x}%): ${tpReached50x ? 'YES' : 'NO'}`, block1X + 10, blockY + 55);
      
      doc.fillColor(slReached50x ? '#e74c3c' : '#27ae60')
         .fontSize(8)
         .font('Helvetica')
         .text(`50X SL (${sl50x}%): ${slReached50x ? 'YES' : 'NO'}`, block1X + 10, blockY + 70);
      
      // Leverage Analysis
      const capital = 400;
      const entryPrice = signalClose;
      
      // Calculate liquidation prices for each leverage (including fees)
      const leverage10x = 10;
      const leverage50x = 50;
      const leverage100x = 100;
      
      // Binance Futures rates: 0.5% maintenance margin + 0.06% fees (0.02% maker + 0.04% taker)
      const maintenanceMarginRate = 0.005; // 0.5% maintenance margin
      const fees = 0.0006; // 0.06% total fees (0.02% maker + 0.04% taker)
      
      // For long positions, liquidation price = entryPrice * (1 - 1/leverage + maintenanceMarginRate + fees)
      const liquidation10x = entryPrice * (1 - 1/leverage10x + maintenanceMarginRate + fees);
      const liquidation50x = entryPrice * (1 - 1/leverage50x + maintenanceMarginRate + fees);
      const liquidation100x = entryPrice * (1 - 1/leverage100x + maintenanceMarginRate + fees);
      
      // Check if any candle reached liquidation prices
      let liquidated10x = false;
      let liquidated50x = false;
      let liquidated100x = false;
      let liquidationCandle10x = 0;
      let liquidationCandle50x = 0;
      let liquidationCandle100x = 0;
      
      for (let j = 0; j < nextCandles.length; j++) {
        const candle = nextCandles[j];
        if (!liquidated10x && candle.low <= liquidation10x) {
          liquidated10x = true;
          liquidationCandle10x = j + 1;
        }
        if (!liquidated50x && candle.low <= liquidation50x) {
          liquidated50x = true;
          liquidationCandle50x = j + 1;
        }
        if (!liquidated100x && candle.low <= liquidation100x) {
          liquidated100x = true;
          liquidationCandle100x = j + 1;
        }
      }
      
      // Calculate liquidation percentages
      const liquidationPercent10x = ((liquidation10x - entryPrice) / entryPrice) * 100;
      const liquidationPercent50x = ((liquidation50x - entryPrice) / entryPrice) * 100;
      const liquidationPercent100x = ((liquidation100x - entryPrice) / entryPrice) * 100;
      
      // Block 2: Leverage Analysis
      const block2X = block1X + blockWidth + blockSpacing;
      
      doc.rect(block2X, blockY, blockWidth, blockHeight)
         .fill('#f8f9fa')
         .stroke('#e74c3c')
         .lineWidth(1);
      
      doc.fillColor('#e74c3c')
         .fontSize(9)
         .font('Helvetica-Bold')
         .text(`LEVERAGE ANALYSIS`, block2X + 10, blockY + 10);
      
      doc.fillColor('#495057')
         .fontSize(8)
         .font('Helvetica')
         .text(`Capital: $${capital}`, block2X + 10, blockY + 25);
      
      // 10X Leverage
      doc.fillColor('#495057')
         .fontSize(8)
         .font('Helvetica')
         .text(`10X: $${liquidation10x.toFixed(0)} (${liquidationPercent10x.toFixed(1)}%)`, block2X + 10, blockY + 40);
      doc.fillColor(liquidated10x ? '#e74c3c' : '#27ae60')
         .fontSize(8)
         .font('Helvetica-Bold')
         .text(liquidated10x ? 'LIQUIDATED' : 'SAFE', block2X + 10, blockY + 55);
      
      // 50X Leverage
      doc.fillColor('#495057')
         .fontSize(8)
         .font('Helvetica')
         .text(`50X: $${liquidation50x.toFixed(0)} (${liquidationPercent50x.toFixed(1)}%)`, block2X + 10, blockY + 70);
      doc.fillColor(liquidated50x ? '#e74c3c' : '#27ae60')
         .fontSize(8)
         .font('Helvetica-Bold')
         .text(liquidated50x ? 'LIQUIDATED' : 'SAFE', block2X + 10, blockY + 85);
      
      // Block 3: Performance Summary
      const block3X = block2X + blockWidth + blockSpacing;
      
      doc.rect(block3X, blockY, blockWidth, blockHeight)
         .fill('#f8f9fa')
         .stroke('#8e44ad')
         .lineWidth(1);
      
      doc.fillColor('#8e44ad')
         .fontSize(9)
         .font('Helvetica-Bold')
         .text(`PERFORMANCE`, block3X + 10, blockY + 10);
      
      doc.fillColor('#2c3e50')
         .fontSize(8)
         .font('Helvetica')
         .text(`Max Rise: +${maxRisePercent.toFixed(2)}%`, block3X + 10, blockY + 25);
      
      doc.fillColor('#2c3e50')
         .fontSize(8)
         .font('Helvetica')
         .text(`Max Fall: ${maxFallPercent.toFixed(2)}%`, block3X + 10, blockY + 40);
      
      doc.fillColor('#2c3e50')
         .fontSize(8)
         .font('Helvetica')
         .text(`Peak Candle: ${maxHighCandleIndex}`, block3X + 10, blockY + 55);
      
      doc.fillColor('#2c3e50')
         .fontSize(8)
         .font('Helvetica')
         .text(`Low Candle: ${minLowCandleIndex}`, block3X + 10, blockY + 70);
      
      y += 160; // Extra space for 3 blocks (moved up)
    } else {
      y += 130;
    }
    
    // Pagination
    if (y > 650) {
      doc.addPage();
      y = 50;
    }
  }
  
  // Footer
  try {
    const pageRange = doc.bufferedPageRange();
    if (pageRange && pageRange.count > 0) {
      const startPage = pageRange.start || 0;
      const pageCount = pageRange.count;
      
      for (let i = startPage; i < startPage + pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fillColor('#95a5a6')
           .fontSize(8)
           .font('Helvetica')
           .text(`Page ${i - startPage + 1} of ${pageCount}`, 50, doc.page.height - 30);
        
        doc.text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })}`, 
                 doc.page.width - 200, doc.page.height - 30);
      }
    }
  } catch (error) {
    console.log('Could not add footer to PDF:', error.message);
  }
  
  doc.end();
  console.log(`✅ Generated individual ${patternName} report: ${filepath}`);
}

// Generate category summary report
async function generateCategorySummaryPDF(category, detections) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
  
  const reportsDir = path.join(__dirname, '..', 'Reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const filename = `${category}-patterns-summary.pdf`;
  const filepath = path.join(reportsDir, filename);
  
  doc.pipe(fs.createWriteStream(filepath));
  
  // Header with gradient-like effect
  doc.rect(0, 0, doc.page.width, 80)
     .fill('#2c3e50');
  
  doc.fillColor('#ffffff')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text(`${category.replace(/-/g, ' ').toUpperCase()} PATTERNS SUMMARY`, 50, 30);
  
  doc.fillColor('#ecf0f1')
     .fontSize(12)
     .font('Helvetica')
     .text(`Total Detections: ${detections.length}`, 50, 55);
  
  // Pattern counts
  let y = 100;
  
  const patternCounts = detections.reduce((acc, detection) => {
    acc[detection.name] = (acc[detection.name] || 0) + 1;
    return acc;
  }, {});
  
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('PATTERN COUNTS', 50, y);
  
  y += 30;
  
  const sortedPatterns = Object.entries(patternCounts)
    .sort(([,a], [,b]) => b - a);
  
  for (const [patternName, count] of sortedPatterns) {
    const percentage = ((count / detections.length) * 100).toFixed(1);
    
    doc.fillColor('#2c3e50')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(`${patternName.replace(/-/g, ' ').toUpperCase()}:`, 70, y);
    
    doc.fillColor('#7f8c8d')
       .fontSize(11)
       .font('Helvetica')
       .text(`${count} detections (${percentage}%)`, 200, y);
    
    y += 25;
    
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
  }
  
  // Footer
  try {
    const pageRange = doc.bufferedPageRange();
    if (pageRange && pageRange.count > 0) {
      const startPage = pageRange.start || 0;
      const pageCount = pageRange.count;
      
      for (let i = startPage; i < startPage + pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fillColor('#95a5a6')
           .fontSize(8)
           .font('Helvetica')
           .text(`Page ${i - startPage + 1} of ${pageCount}`, 50, doc.page.height - 30);
        
        doc.text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })}`, 
                 doc.page.width - 200, doc.page.height - 30);
      }
    }
  } catch (error) {
    console.log('Could not add footer to PDF:', error.message);
  }
  
  doc.end();
  console.log(`✅ Generated ${category} summary report: ${filepath}`);
}

// Keep old function for backward compatibility
async function generateCategoryPDF(category, detections) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
  
  const reportsDir = path.join(__dirname, '..', 'Reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const filename = `${category}-patterns-report.pdf`;
  const filepath = path.join(reportsDir, filename);
  
  doc.pipe(fs.createWriteStream(filepath));
  
  // Header with gradient-like effect
  doc.rect(0, 0, doc.page.width, 80)
     .fill('#2c3e50');
  
  doc.fillColor('#ecf0f1')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text(category.toUpperCase().replace('-', ' ') + ' PATTERNS', 50, 25);
  
  doc.fillColor('#bdc3c7')
     .fontSize(12)
     .font('Helvetica')
     .text('Pattern Detection Analysis Report', 50, 55);
  
  let y = 120;
  
  // Summary statistics
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('SUMMARY STATISTICS', 50, y);
  
  y += 30;
  
  const patternCounts = detections.reduce((acc, detection) => {
    acc[detection.name] = (acc[detection.name] || 0) + 1;
    return acc;
  }, {});
  
  const totalDetections = detections.length;
  const uniquePatterns = Object.keys(patternCounts).length;
  
  doc.fillColor('#34495e')
     .fontSize(12)
     .font('Helvetica-Bold')
     .text(`Total Detections: ${totalDetections}`, 70, y);
  
  y += 20;
  doc.text(`Unique Patterns: ${uniquePatterns}`, 70, y);
  
  y += 20;
  doc.text(`Average Confidence: ${(detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length * 100).toFixed(1)}%`, 70, y);
  
  y += 40;
  
  // Pattern breakdown
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('PATTERN BREAKDOWN', 50, y);
  
  y += 30;
  
  const sortedPatterns = Object.entries(patternCounts)
    .sort(([,a], [,b]) => b - a);
  
  sortedPatterns.forEach(([name, count], index) => {
    const percentage = ((count / totalDetections) * 100).toFixed(1);
    
    // Pattern name with count
    doc.fillColor('#2c3e50')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`${index + 1}. ${name.replace(/-/g, ' ').toUpperCase()}`, 70, y);
    
    y += 18;
    
    // Count and percentage with visual bar
    doc.fillColor('#7f8c8d')
       .fontSize(11)
       .font('Helvetica')
       .text(`${count} detections (${percentage}%)`, 90, y);
    
    // Visual percentage bar
    const barWidth = 200;
    const barHeight = 8;
    const fillWidth = (count / Math.max(...Object.values(patternCounts))) * barWidth;
    
    doc.rect(90, y + 15, barWidth, barHeight)
       .fill('#ecf0f1');
    
    doc.rect(90, y + 15, fillWidth, barHeight)
       .fill('#3498db');
    
    y += 35;
    
    // Pagination
    if (y > 650) {
      doc.addPage();
      y = 50;
    }
  });
  
  y += 30;
  
  // Detailed detections (all detections)
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text(`DETAILED DETECTIONS (All ${detections.length})`, 50, y);
  
  y += 30;
  
  const sortedDetections = detections
    .sort((a, b) => b.confidence - a.confidence);
  
  sortedDetections.forEach((detection, index) => {
    // Detection header
    doc.fillColor('#34495e')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(`${index + 1}. ${detection.name.replace(/-/g, ' ').toUpperCase()}`, 70, y);
    
    y += 20;
    
    // Details in a nice box
    const boxY = y;
    const boxHeight = 95;
    
    doc.rect(70, boxY, 450, boxHeight)
       .fill('#f8f9fa')
       .stroke('#bdc3c7');
    
    doc.fillColor('#2c3e50')
       .fontSize(10)
       .font('Helvetica')
       .text(`Time: ${detection.timestampLocal}`, 80, boxY + 10);
    
    doc.text(`Index: ${detection.index}`, 80, boxY + 25);
    
    // Add OHLC data if available
    if (detection.candle) {
      doc.text(`Open: $${detection.candle.open.toFixed(2)}`, 80, boxY + 40);
      doc.text(`Close: $${detection.candle.close.toFixed(2)}`, 200, boxY + 40);
      doc.text(`High: $${detection.candle.high.toFixed(2)}`, 320, boxY + 40);
      doc.text(`Low: $${detection.candle.low.toFixed(2)}`, 440, boxY + 40);
    }
    
    doc.text(`Prediction: ${detection.typicalPrediction}`, 80, boxY + 55);
    doc.text(`Context: ${detection.commonContext}`, 80, boxY + 70);
    
    // Confidence with color coding
    const confPercent = (detection.confidence * 100).toFixed(1);
    const confColor = detection.confidence > 0.8 ? '#27ae60' : detection.confidence > 0.6 ? '#f39c12' : '#e74c3c';
    
    doc.fillColor(confColor)
       .font('Helvetica-Bold')
       .text(`Confidence: ${confPercent}%`, 300, boxY + 55);
    
    y += boxHeight + 20;
    
    // Pagination
    if (y > 580) {
      doc.addPage();
      y = 50;
    }
  });
  
  // Footer
  try {
    const pageRange = doc.bufferedPageRange();
    if (pageRange && pageRange.count > 0) {
      const startPage = pageRange.start || 0;
      const pageCount = pageRange.count;
      
      for (let i = startPage; i < startPage + pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fillColor('#95a5a6')
           .fontSize(10)
           .text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })} | Page ${i - startPage + 1} of ${pageCount}`, 50, doc.page.height - 30);
        
        doc.text('Shape-only analysis • No validations or confirmations applied', 50, doc.page.height - 15);
      }
    }
  } catch (error) {
    console.warn('Could not add footer to PDF:', error.message);
  }
  
  doc.end();
  console.log(`✅ Generated ${category} report: Patterns/Reports/${filename}`);
}

async function generateMainSummaryReport(detections, totalCandles) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
  
  const reportsDir = path.join(__dirname, '..', 'Reports');
  const filepath = path.join(reportsDir, 'pattern-detection-summary.pdf');
  
  doc.pipe(fs.createWriteStream(filepath));
  
  // Beautiful header
  doc.rect(0, 0, doc.page.width, 100)
     .fill('#1a252f');
  
  doc.fillColor('#ecf0f1')
     .fontSize(28)
     .font('Helvetica-Bold')
     .text('PATTERN DETECTION', 50, 25);
  
  doc.fillColor('#3498db')
     .fontSize(28)
     .font('Helvetica-Bold')
     .text('SUMMARY REPORT', 50, 55);
  
  doc.fillColor('#bdc3c7')
     .fontSize(12)
     .font('Helvetica')
     .text('Comprehensive Analysis of 20,000 ETHUSDT Historical Candles', 50, 85);
  
  let y = 140;
  
  // Executive Summary
  doc.fillColor('#2c3e50')
     .fontSize(18)
     .font('Helvetica-Bold')
     .text('EXECUTIVE SUMMARY', 50, y);
  
  y += 40;
  
  const totalDetections = detections.length;
  const typeCounts = detections.reduce((acc, detection) => {
    acc[detection.type] = (acc[detection.type] || 0) + 1;
    return acc;
  }, {});
  
  // Summary stats in boxes
  const stats = [
    { label: 'Total Candles', value: totalCandles.toLocaleString(), color: '#3498db' },
    { label: 'Total Patterns', value: totalDetections.toLocaleString(), color: '#27ae60' },
    { label: 'Pattern Types', value: Object.keys(typeCounts).length.toString(), color: '#f39c12' },
    { label: 'Detection Rate', value: ((totalDetections / totalCandles) * 100).toFixed(2) + '%', color: '#e74c3c' }
  ];
  
  stats.forEach((stat, index) => {
    const x = 50 + (index * 120);
    const boxWidth = 100;
    const boxHeight = 60;
    
    doc.rect(x, y, boxWidth, boxHeight)
       .fill(stat.color)
       .stroke('#2c3e50');
    
    doc.fillColor('#ffffff')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(stat.label, x + 5, y + 10);
    
    doc.fillColor('#ffffff')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text(stat.value, x + 5, y + 30);
  });
  
  y += 100;
  
  // Category breakdown
  doc.fillColor('#2c3e50')
     .fontSize(18)
     .font('Helvetica-Bold')
     .text('CATEGORY BREAKDOWN', 50, y);
  
  y += 40;
  
  Object.entries(typeCounts).forEach(([type, count]) => {
    const percentage = ((count / totalDetections) * 100).toFixed(1);
    const colors = {
      'single-candle': '#3498db',
      'double-candle': '#27ae60',
      'triple-candle': '#f39c12',
      'chart-patterns': '#e74c3c'
    };
    
    doc.fillColor(colors[type] || '#95a5a6')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(type.replace(/-/g, ' ').toUpperCase(), 70, y);
    
    y += 20;
    
    doc.fillColor('#2c3e50')
       .fontSize(12)
       .font('Helvetica')
       .text(`${count} detections (${percentage}%)`, 90, y);
    
    // Visual bar
    const barWidth = 300;
    const barHeight = 12;
    const fillWidth = (count / Math.max(...Object.values(typeCounts))) * barWidth;
    
    doc.rect(90, y + 15, barWidth, barHeight)
       .fill('#ecf0f1');
    
    doc.rect(90, y + 15, fillWidth, barHeight)
       .fill(colors[type] || '#95a5a6');
    
    y += 45;
  });
  
  y += 20;
  
  // Top patterns
  doc.fillColor('#2c3e50')
     .fontSize(18)
     .font('Helvetica-Bold')
     .text('TOP 10 PATTERNS', 50, y);
  
  y += 40;
  
  const patternCounts = detections.reduce((acc, detection) => {
    acc[detection.name] = (acc[detection.name] || 0) + 1;
    return acc;
  }, {});
  
  const topPatterns = Object.entries(patternCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  
  topPatterns.forEach(([name, count], index) => {
    const percentage = ((count / totalDetections) * 100).toFixed(1);
    
    // Number for top patterns
    const medal = `${index + 1}.`;
    
    doc.fillColor('#2c3e50')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`${medal} ${name.replace(/-/g, ' ').toUpperCase()}`, 70, y);
    
    y += 20;
    
    doc.fillColor('#7f8c8d')
       .fontSize(12)
       .font('Helvetica')
       .text(`${count} detections (${percentage}%)`, 90, y);
    
    y += 30;
  });
  
  // Footer
  try {
    const pageRange = doc.bufferedPageRange();
    if (pageRange && pageRange.count > 0) {
      const startPage = pageRange.start || 0;
      const pageCount = pageRange.count;
      
      for (let i = startPage; i < startPage + pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fillColor('#95a5a6')
           .fontSize(10)
           .text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })} | Page ${i - startPage + 1} of ${pageCount}`, 50, doc.page.height - 30);
        
        doc.text('Pattern Detection System • Shape-only Analysis', 50, doc.page.height - 15);
      }
    }
  } catch (error) {
    console.warn('Could not add footer to PDF:', error.message);
  }
  
  doc.end();
  console.log('✅ Generated main summary report: Patterns/Reports/pattern-detection-summary.pdf');
}

/**
 * Utility Functions
 */
function convertTimestampToLima(timestamp) {
  const date = new Date(timestamp);
  
  // Convert to Lima timezone
  const limaDate = new Date(date.toLocaleString("en-US", {timeZone: "America/Lima"}));
  const limaDay = limaDate.getDate().toString().padStart(2, '0');
  const limaMonth = (limaDate.getMonth() + 1).toString().padStart(2, '0');
  const limaYear = limaDate.getFullYear();
  const limaHours = limaDate.getHours().toString().padStart(2, '0');
  const limaMinutes = limaDate.getMinutes().toString().padStart(2, '0');
  const limaSeconds = limaDate.getSeconds().toString().padStart(2, '0');
  
  return `${limaDay}/${limaMonth}/${limaYear} ${limaHours}:${limaMinutes}:${limaSeconds}`;
}

function convertTimestampToMexico(timestamp) {
  const date = new Date(timestamp);
  
  // Convert to Mexico timezone
  const mexicoDate = new Date(date.toLocaleString("en-US", {timeZone: "America/Mexico_City"}));
  const mexicoDay = mexicoDate.getDate().toString().padStart(2, '0');
  const mexicoMonth = (mexicoDate.getMonth() + 1).toString().padStart(2, '0');
  const mexicoYear = mexicoDate.getFullYear();
  const mexicoHours = mexicoDate.getHours().toString().padStart(2, '0');
  const mexicoMinutes = mexicoDate.getMinutes().toString().padStart(2, '0');
  const mexicoSeconds = mexicoDate.getSeconds().toString().padStart(2, '0');
  
  return `${mexicoDay}/${mexicoMonth}/${mexicoYear} ${mexicoHours}:${mexicoMinutes}:${mexicoSeconds}`;
}

// Export main functions
module.exports = {
  runMarubozuBacktestOnly,  // New simplified function
  runPatternBacktest,       // Original comprehensive function
  initializeRedis,
  fetchHistoricalData,
  fetchHistoricalDataWithValidation,
  storeCandlesInRedis,
  storeCandlesInRedisPermanent,
  getCandlesFromRedis,
  loadMarubozuDetector,
  scanMarubozuPatterns,
  generateMarubozuCandleReport,
  loadPatternDetectors,
  scanAllPatterns,
  scanSingleCandlePatterns,
  scanDoubleCandlePatterns,
  scanTripleCandlePatterns,
  scanChartPatterns,
  generateCategoryReports,
  generateMainSummaryReport,
  convertTimestampToLima,
  parseArgs
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force')
  };
}

/**
 * Run backtesting for Marubozu pattern
 */
async function runMarubozuBacktest(detections, allCandles) {
  // Filter Marubozu detections
  const marubozuDetections = detections.filter(d => d.name === 'marubozu');
  
  if (marubozuDetections.length === 0) {
    console.log('❌ No Marubozu detections found for backtesting');
    return;
  }
  
  console.log(`🔍 Found ${marubozuDetections.length} Marubozu detections for backtesting`);
  
  // Run backtesting
  const backtestResults = backtestPatternDetections(marubozuDetections, allCandles, {
    stopLossPercent: 0.01,
    takeProfitPercent: 0.01,
    evaluationCandles: 5 // Evaluate next 5 candles
  });
  
  // Generate statistics
  const stats = generateBacktestStats(backtestResults);
  
  console.log(`📈 Backtest Results for Marubozu:`);
  console.log(`   Total Trades: ${stats.total}`);
  console.log(`   Wins: ${stats.wins} (${stats.winRate.toFixed(1)}%)`);
  console.log(`   Losses: ${stats.losses} (${stats.lossRate.toFixed(1)}%)`);
  console.log(`   Exit Price: ${stats.exitPrice} (${stats.exitPriceRate.toFixed(1)}%)`);
  console.log(`   Total P&L: ${stats.totalPnL.toFixed(2)}%`);
  console.log(`   Avg Win P&L: ${stats.avgWinPnL.toFixed(2)}%`);
  console.log(`   Avg Loss P&L: ${stats.avgLossPnL.toFixed(2)}%`);
  console.log(`   Avg Exit Price P&L: ${stats.avgExitPricePnL.toFixed(2)}%`);
  
  // Generate backtest reports
  await generateBacktestReport('marubozu', backtestResults, stats, allCandles);
  
  // Generate separate report only for UNKNOWN trades
  const unknownResults = backtestResults.filter(r => r.result === 'UNKNOWN');
  
  if (unknownResults.length > 0) {
    const unknownStats = generateBacktestStats(unknownResults);
    await generateBacktestReport('marubozu-unknown', unknownResults, unknownStats, allCandles);
    console.log(`✅ Generated UNKNOWN trades report: ${unknownResults.length} trades`);
  }
  
  // Analyze losing patterns
  analyzeLosingPatterns(backtestResults, allCandles);
  
  console.log('✅ Marubozu backtesting completed');
}

/**
 * Analyze patterns in losing trades to understand why they failed
 */
function analyzeLosingPatterns(backtestResults, allCandles) {
  console.log('\n🔍 ANALYZING LOSING PATTERNS...');
  
  // Filter losing trades
  const losingTrades = backtestResults.filter(r => r.result === 'LOSS' || (r.result === 'UNKNOWN' && r.pnl < 0));
  
  if (losingTrades.length === 0) {
    console.log('❌ No losing trades found to analyze');
    return;
  }
  
  console.log(`📊 Analyzing ${losingTrades.length} losing trades...`);
  
  // Analyze patterns
  const analysis = {
    immediateReversal: 0,
    gradualDecline: 0,
    falseBreakout: 0,
    gapDown: 0,
    consolidationBreakdown: 0,
    volumeSpike: 0,
    resistanceRejection: 0,
    supportBreak: 0
  };
  
  const detailedAnalysis = [];
  
  for (const trade of losingTrades) {
    const signalIndex = trade.detection.index;
    const signalCandle = allCandles[signalIndex];
    
    // Get previous 20 candles for analysis (context before the signal)
    const previousCandles = [];
    for (let i = 1; i <= 20; i++) {
      if (signalIndex - i >= 0) {
        previousCandles.push(allCandles[signalIndex - i]);
      }
    }
    
    if (previousCandles.length === 0) continue;
    
    const analysisResult = analyzeSingleLosingTrade(trade, signalCandle, previousCandles);
    analysis[analysisResult.pattern]++;
    
    detailedAnalysis.push({
      tradeIndex: trade.detection.index,
      timestamp: trade.detection.timestampLocal,
      pattern: analysisResult.pattern,
      reason: analysisResult.reason,
      details: analysisResult.details
    });
  }
  
  // Display results
  console.log('\n📈 LOSING PATTERN ANALYSIS RESULTS:');
  console.log('=====================================');
  
  const sortedPatterns = Object.entries(analysis)
    .filter(([pattern, count]) => count > 0)
    .sort(([,a], [,b]) => b - a);
  
  for (const [pattern, count] of sortedPatterns) {
    const percentage = ((count / losingTrades.length) * 100).toFixed(1);
    console.log(`📊 ${pattern.replace(/([A-Z])/g, ' $1').toUpperCase()}: ${count} trades (${percentage}%)`);
  }
  
  // Show detailed analysis for top patterns
  console.log('\n🔍 DETAILED ANALYSIS (Top 3 Patterns):');
  const topPatterns = sortedPatterns.slice(0, 3);
  
  for (const [pattern] of topPatterns) {
    const patternTrades = detailedAnalysis.filter(t => t.pattern === pattern);
    console.log(`\n📋 ${pattern.replace(/([A-Z])/g, ' $1').toUpperCase()}:`);
    
    // Show first 3 examples
    for (let i = 0; i < Math.min(3, patternTrades.length); i++) {
      const trade = patternTrades[i];
      console.log(`  ${i + 1}. Index ${trade.tradeIndex} (${formatDateTime24h(trade.timestamp)})`);
      console.log(`     Reason: ${trade.reason}`);
      console.log(`     Details: ${trade.details}`);
    }
  }
  
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('===================');
  
  if (analysis.immediateReversal > losingTrades.length * 0.3) {
    console.log('⚠️  High immediate reversal rate - Consider waiting for confirmation candle');
  }
  
  if (analysis.falseBreakout > losingTrades.length * 0.2) {
    console.log('⚠️  Many false breakouts - Consider volume confirmation');
  }
  
  if (analysis.resistanceRejection > losingTrades.length * 0.2) {
    console.log('⚠️  High resistance rejection - Avoid entries near resistance levels');
  }
  
  if (analysis.volumeSpike > losingTrades.length * 0.1) {
    console.log('⚠️  Volume spikes causing losses - Consider volume-based filters');
  }
}

/**
 * Analyze a single losing trade to determine the failure pattern
 * This analyzes PREVIOUS candles to identify risk conditions that could have been detected BEFORE entering
 */
function analyzeSingleLosingTrade(trade, signalCandle, previousCandles) {
  const isBullish = trade.isBullish;
  const entryPrice = trade.entryPrice;
  
  // Check for nearby resistance levels (for bullish trades)
  if (isBullish) {
    const nearbyResistance = findNearbyResistance(entryPrice, previousCandles);
    if (nearbyResistance) {
      return {
        pattern: 'resistanceRejection',
        reason: 'Entry near resistance level (detectable before trade)',
        details: `Entry: $${entryPrice.toFixed(2)}, Resistance: $${nearbyResistance.toFixed(2)}, Distance: ${((nearbyResistance - entryPrice) / entryPrice * 100).toFixed(2)}%`
      };
    }
  }
  
  // Check for nearby support levels (for bearish trades)
  if (!isBullish) {
    const nearbySupport = findNearbySupport(entryPrice, previousCandles);
    if (nearbySupport) {
      return {
        pattern: 'supportBreak',
        reason: 'Entry near support level (detectable before trade)',
        details: `Entry: $${entryPrice.toFixed(2)}, Support: $${nearbySupport.toFixed(2)}, Distance: ${((entryPrice - nearbySupport) / entryPrice * 100).toFixed(2)}%`
      };
    }
  }
  
  // Check for recent high volume (potential volatility risk)
  const recentVolumeSpike = detectRecentVolumeSpike(signalCandle, previousCandles);
  if (recentVolumeSpike) {
    return {
      pattern: 'volumeSpike',
      reason: 'Recent volume spike detected (high volatility risk)',
      details: `Volume spike: ${recentVolumeSpike.toFixed(1)}x average`
    };
  }
  
  // Check for immediate reversal pattern (weak momentum before entry)
  const weakMomentum = detectWeakMomentum(signalCandle, previousCandles, isBullish);
  if (weakMomentum) {
    return {
      pattern: 'immediateReversal',
      reason: 'Weak momentum detected before entry',
      details: `Momentum score: ${weakMomentum.toFixed(2)} (weak)`
    };
  }
  
  // Check for false breakout setup (price approaching breakout level)
  const falseBreakoutSetup = detectFalseBreakoutSetup(entryPrice, previousCandles, isBullish);
  if (falseBreakoutSetup) {
    return {
      pattern: 'falseBreakout',
      reason: 'False breakout setup detected',
      details: `Breakout level: $${falseBreakoutSetup.toFixed(2)}, Attempts: ${falseBreakoutSetup.attempts}`
    };
  }
  
  // Check for gradual decline in context
  const decliningContext = detectDecliningContext(previousCandles, isBullish);
  if (decliningContext) {
    return {
      pattern: 'gradualDecline',
      reason: 'Declining context detected before entry',
      details: `Decline rate: ${decliningContext.toFixed(2)}% over recent candles`
    };
  }
  
  // Default to consolidation breakdown
  return {
    pattern: 'consolidationBreakdown',
    reason: 'Consolidation pattern without clear risk signals',
    details: 'No clear risk pattern identified in previous context'
  };
}

/**
 * Find nearby resistance levels in previous candles
 */
function findNearbyResistance(price, previousCandles) {
  const tolerance = price * 0.01; // 1% tolerance
  
  // Look for recent highs that could act as resistance
  for (const candle of previousCandles.slice(0, 10)) { // Check last 10 candles
    if (Math.abs(candle.high - price) <= tolerance && candle.high >= price) {
      return candle.high;
    }
  }
  return null;
}

/**
 * Find nearby support levels in previous candles
 */
function findNearbySupport(price, previousCandles) {
  const tolerance = price * 0.01; // 1% tolerance
  
  // Look for recent lows that could act as support
  for (const candle of previousCandles.slice(0, 10)) { // Check last 10 candles
    if (Math.abs(candle.low - price) <= tolerance && candle.low <= price) {
      return candle.low;
    }
  }
  return null;
}

/**
 * Detect recent volume spikes that could indicate high volatility
 */
function detectRecentVolumeSpike(signalCandle, previousCandles) {
  if (!signalCandle.volume) return null;
  
  // Calculate average volume from previous candles
  let totalVolume = 0;
  let volumeCount = 0;
  
  for (const candle of previousCandles.slice(0, 10)) {
    if (candle.volume) {
      totalVolume += candle.volume;
      volumeCount++;
    }
  }
  
  if (volumeCount === 0) return null;
  
  const avgVolume = totalVolume / volumeCount;
  const currentVolumeRatio = signalCandle.volume / avgVolume;
  
  return currentVolumeRatio > 2.5 ? currentVolumeRatio : null; // 2.5x average volume
}

/**
 * Detect weak momentum before entry
 */
function detectWeakMomentum(signalCandle, previousCandles, isBullish) {
  // Check recent price action for weak momentum
  let momentumScore = 0;
  const recentCandles = previousCandles.slice(0, 5);
  
  for (let i = 0; i < recentCandles.length - 1; i++) {
    const current = recentCandles[i];
    const previous = recentCandles[i + 1];
    
    if (isBullish) {
      momentumScore += (current.close - previous.close) / previous.close;
    } else {
      momentumScore += (previous.close - current.close) / previous.close;
    }
  }
  
  // Normalize momentum score
  momentumScore = momentumScore / recentCandles.length;
  
  return momentumScore < 0.002 ? momentumScore : null; // Weak momentum threshold
}

/**
 * Detect false breakout setup (multiple attempts at same level)
 */
function detectFalseBreakoutSetup(entryPrice, previousCandles, isBullish) {
  const tolerance = entryPrice * 0.005; // 0.5% tolerance
  let attempts = 0;
  let breakoutLevel = null;
  
  // Look for multiple touches of similar levels
  for (const candle of previousCandles.slice(0, 15)) {
    if (isBullish) {
      // For bullish, look for resistance levels
      if (Math.abs(candle.high - entryPrice) <= tolerance && candle.high >= entryPrice) {
        attempts++;
        breakoutLevel = candle.high;
      }
    } else {
      // For bearish, look for support levels
      if (Math.abs(candle.low - entryPrice) <= tolerance && candle.low <= entryPrice) {
        attempts++;
        breakoutLevel = candle.low;
      }
    }
  }
  
  return attempts >= 2 ? { level: breakoutLevel, attempts } : null;
}

/**
 * Detect declining context before entry
 */
function detectDecliningContext(previousCandles, isBullish) {
  if (previousCandles.length < 5) return null;
  
  // Calculate overall trend in previous candles
  const firstCandle = previousCandles[previousCandles.length - 1]; // Oldest
  const lastCandle = previousCandles[0]; // Most recent
  
  const totalMove = (lastCandle.close - firstCandle.close) / firstCandle.close;
  
  if (isBullish && totalMove < -0.01) { // Declining for bullish trade
    return Math.abs(totalMove) * 100;
  } else if (!isBullish && totalMove > 0.01) { // Rising for bearish trade
    return totalMove * 100;
  }
  
  return null;
}

// Run if called directly
if (require.main === module) {
  const args = parseArgs();
  runMarubozuBacktestOnly(args.force).catch(console.error);
}