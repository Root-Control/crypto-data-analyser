/**
 * Pattern Backtest System
 * 
 * STAGE 2: Historical data ingestion, Redis storage, pattern scanning, and PDF reporting
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Redis = require('redis');
const PDFDocument = require('pdfkit');

// Redis client
let redisClient = null;

/**
 * MAIN BACKTEST PROCESS
 */

async function runPatternBacktest() {
  console.log('🚀 Starting Pattern Detection Backtest...');
  
  try {
    // STEP 1: Initialize Redis connection
    await initializeRedis();
    
    // STEP 2: Historical Data Ingestion
    console.log('📊 Fetching historical data from Binance...');
    const candles = await fetchHistoricalData();
    
    // STEP 3: Store in Redis
    console.log('💾 Storing candles in Redis...');
    await storeCandlesInRedis(candles);
    
    // STEP 4: Load pattern detectors
    console.log('🔍 Loading pattern detectors...');
    const detectors = await loadPatternDetectors();
    
    // STEP 5: Scan for patterns
    console.log('🔎 Scanning for patterns in 30,000 candles...');
    const detections = await scanAllPatterns(candles, detectors);
    
    // STEP 6: Generate PDF report
    console.log('📄 Generating PDF report...');
    await generatePatternReportPDF(detections);
    
    // STEP 7: Console summary
    console.log('✅ Backtest completed successfully!');
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

async function fetchHistoricalData() {
  const symbol = 'ETHUSDT';
  const interval = '15m';
  const limit = 5000; // 5000 candles per request
  const totalCandles = 30000; // Total target
  const iterations = 6; // 6 iterations * 5000 = 30000
  
  let allCandles = [];
  let endTime = Date.now(); // Start from now
  
  console.log(`📈 Fetching ${totalCandles} candles in ${iterations} batches...`);
  
  for (let i = 0; i < iterations; i++) {
    console.log(`  Batch ${i + 1}/${iterations}...`);
    
    try {
      const url = `https://api.binance.com/api/v3/klines`;
      const params = {
        symbol,
        interval,
        limit,
        endTime
      };
      
      const response = await axios.get(url, { params });
      const candles = response.data.map(kline => ({
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        timestamp: kline[0],
        openTime: new Date(kline[0])
      }));
      
      // Reverse to get chronological order (oldest first)
      allCandles = candles.reverse().concat(allCandles);
      
      // Set endTime for next batch (go backward in time)
      endTime = candles[0].timestamp - 1;
      
      console.log(`    ✅ Fetched ${candles.length} candles`);
      
      // Cooldown between requests
      if (i < iterations - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`    ❌ Error fetching batch ${i + 1}:`, error.message);
      throw error;
    }
  }
  
  console.log(`✅ Total candles fetched: ${allCandles.length}`);
  return allCandles;
}

async function storeCandlesInRedis(candles) {
  const key = 'ETHUSD_HISTORICAL_CANDLES';
  await redisClient.set(key, JSON.stringify(candles));
  console.log(`✅ Stored ${candles.length} candles in Redis under key: ${key}`);
}

/**
 * Pattern Loading Functions
 */
async function loadPatternDetectors() {
  const detectors = {
    'single-candle': [],
    'double-candle': [],
    'triple-candle': [],
    'chart-patterns': []
  };
  
  const patternDirs = ['single-candle', 'double-candle', 'triple-candle', 'chart-patterns'];
  
  for (const dir of patternDirs) {
    const dirPath = path.join(__dirname, 'Patterns', dir);
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
async function scanAllPatterns(candles, detectors) {
  const detections = [];
  
  // Scan single-candle patterns
  console.log('  Scanning single-candle patterns...');
  const singleDetections = await scanSingleCandlePatterns(candles, detectors['single-candle']);
  detections.push(...singleDetections);
  
  // Scan double-candle patterns
  console.log('  Scanning double-candle patterns...');
  const doubleDetections = await scanDoubleCandlePatterns(candles, detectors['double-candle']);
  detections.push(...doubleDetections);
  
  // Scan triple-candle patterns
  console.log('  Scanning triple-candle patterns...');
  const tripleDetections = await scanTripleCandlePatterns(candles, detectors['triple-candle']);
  detections.push(...tripleDetections);
  
  // Scan chart patterns
  console.log('  Scanning chart patterns...');
  const chartDetections = await scanChartPatterns(candles, detectors['chart-patterns']);
  detections.push(...chartDetections);
  
  return detections;
}

async function scanSingleCandlePatterns(candles, detectors) {
  const detections = [];
  
  for (let i = 0; i < candles.length; i++) {
    for (const detector of detectors) {
      try {
        const result = detector.detect(candles, i);
        if (result.match) {
          detections.push({
            name: detector.name,
            type: detector.type,
            index: i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext
          });
        }
      } catch (error) {
        // Skip problematic patterns
      }
    }
  }
  
  return detections;
}

async function scanDoubleCandlePatterns(candles, detectors) {
  const detections = [];
  
  for (let i = 0; i < candles.length - 1; i++) {
    for (const detector of detectors) {
      try {
        const result = detector.detect(candles, i);
        if (result.match) {
          detections.push({
            name: detector.name,
            type: detector.type,
            index: i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext
          });
        }
      } catch (error) {
        // Skip problematic patterns
      }
    }
  }
  
  return detections;
}

async function scanTripleCandlePatterns(candles, detectors) {
  const detections = [];
  
  for (const detector of detectors) {
    for (let i = 0; i < candles.length - detector.minCandles + 1; i++) {
      try {
        const result = detector.detect(candles, i);
        if (result.match) {
          detections.push({
            name: detector.name,
            type: detector.type,
            index: i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext
          });
        }
      } catch (error) {
        // Skip problematic patterns
      }
    }
  }
  
  return detections;
}

async function scanChartPatterns(candles, detectors) {
  const detections = [];
  
  for (const detector of detectors) {
    const windowSize = detector.minCandles || 50;
    for (let i = 0; i < candles.length - windowSize + 1; i++) {
      try {
        const result = detector.detect(candles, i, windowSize);
        if (result.match) {
          detections.push({
            name: detector.name,
            type: detector.type,
            index: i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext
          });
        }
      } catch (error) {
        // Skip problematic patterns
      }
    }
  }
  
  return detections;
}

/**
 * PDF Generation Functions
 */
async function generatePatternReportPDF(detections) {
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream('pattern-report.pdf'));
  
  // Title
  doc.fontSize(20).text('Pattern Detection Report', 50, 50);
  doc.fontSize(12).text('Shape-only analysis of 30,000 ETHUSDT candles (15m timeframe)', 50, 80);
  doc.text('Generated: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }), 50, 100);
  doc.text('Note: Evaluating only shape (shape-only); no invalidations or confirmations applied', 50, 120);
  
  let y = 150;
  
  // Summary by category
  doc.fontSize(16).text('Summary by Category', 50, y);
  y += 30;
  
  const typeCounts = detections.reduce((acc, detection) => {
    acc[detection.type] = (acc[detection.type] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(typeCounts).forEach(([type, count]) => {
    doc.fontSize(12).text(`${type}: ${count} detections`, 70, y);
    y += 20;
  });
  
  y += 20;
  
  // Pattern counts table
  doc.fontSize(16).text('Pattern Counts', 50, y);
  y += 30;
  
  const patternCounts = detections.reduce((acc, detection) => {
    acc[detection.name] = (acc[detection.name] || 0) + 1;
    return acc;
  }, {});
  
  const sortedPatterns = Object.entries(patternCounts)
    .sort(([,a], [,b]) => b - a);
  
  sortedPatterns.forEach(([name, count]) => {
    doc.fontSize(12).text(`${name}: ${count} detections`, 70, y);
    y += 20;
    
    // Pagination
    if (y > 750) {
      doc.addPage();
      y = 50;
    }
  });
  
  y += 20;
  
  // Detailed listings (first 100 for brevity)
  doc.fontSize(16).text('Detailed Detections (First 100)', 50, y);
  y += 30;
  
  const limitedDetections = detections.slice(0, 100);
  limitedDetections.forEach((detection, index) => {
    doc.fontSize(10).text(`${index + 1}. ${detection.name} (${detection.type})`, 70, y);
    y += 15;
    doc.text(`   Index: ${detection.index}`, 90, y);
    y += 12;
    doc.text(`   Time: ${detection.timestampLocal}`, 90, y);
    y += 12;
    doc.text(`   Prediction: ${detection.typicalPrediction}`, 90, y);
    y += 12;
    doc.text(`   Context: ${detection.commonContext}`, 90, y);
    y += 12;
    doc.text(`   Confidence: ${(detection.confidence * 100).toFixed(1)}%`, 90, y);
    y += 20;
    
    // Pagination
    if (y > 750) {
      doc.addPage();
      y = 50;
    }
  });
  
  doc.end();
  console.log('✅ PDF report generated: pattern-report.pdf');
}

/**
 * Utility Functions
 */
function convertTimestampToLima(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { 
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Export main function
module.exports = {
  runPatternBacktest,
  // Export helper functions for implementation
  fetchBinanceCandles,
  storeCandlesInRedis,
  loadPatternDetectors,
  scanSingleCandlePatterns,
  scanDoubleCandlePatterns,
  scanTripleCandlePatterns,
  scanChartPatterns,
  generatePatternReportPDF,
  convertTimestampToLima,
  calculatePatternStatistics
};

// Run if called directly
if (require.main === module) {
  runPatternBacktest().catch(console.error);
}
