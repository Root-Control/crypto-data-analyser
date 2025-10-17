/**
 * Pattern Backtest System - Enhanced Version
 * 
 * STAGE 2: Historical data ingestion, Redis storage, pattern scanning, and beautiful PDF reporting
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

async function runPatternBacktest(forceRefresh = false) {
  console.log('🚀 Starting Enhanced Pattern Detection Backtest...');
  
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
      console.log('🚀 Using cached data, skipping API calls');
    }
    
    // STEP 5: Load pattern detectors
    console.log('🔍 Loading pattern detectors...');
    const detectors = await loadPatternDetectors();
    
    // STEP 6: Scan for patterns
    console.log('🔎 Scanning for patterns in 20,000 historical candles...');
    const detections = await scanAllPatterns(candles, detectors);
    
    // STEP 7: Generate beautiful PDF reports by category
    console.log('📄 Generating beautiful PDF reports...');
    await generateCategoryReports(detections);
    
    // STEP 8: Generate main summary report
    console.log('📊 Generating main summary report...');
    await generateMainSummaryReport(detections, candles.length);
    
    // STEP 9: Console summary
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
  const totalCandles = 20000; // Total target
  const iterations = 20; // 20 iterations * 1000 = 20000
  
  let allCandles = [];
  let endTime = Date.now(); // Start from now
  let lastTimestamp = null;
  let duplicatesFound = 0;
  let invalidCandles = 0;
  
  console.log(`📈 Fetching ${totalCandles} candles in ${iterations} batches with temporal validation...`);
  
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
      const rawCandles = response.data.map(kline => ({
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        timestamp: parseInt(kline[0]),
        openTime: new Date(parseInt(kline[0]))
      }));
      
      // Validate and filter candles
      const validCandles = [];
      let batchLastTimestamp = null;
      
      for (const candle of rawCandles) {
        // Validate candle data
        if (!candle.open || !candle.high || !candle.low || !candle.close || !candle.timestamp) {
          invalidCandles++;
          continue;
        }
        
        // Check for temporal duplicates within this batch only
        if (batchLastTimestamp && candle.timestamp <= batchLastTimestamp) {
          duplicatesFound++;
          continue;
        }
        
        // Validate OHLC relationships
        if (candle.high < candle.low || candle.high < candle.open || candle.high < candle.close ||
            candle.low > candle.open || candle.low > candle.close) {
          invalidCandles++;
          continue;
        }
        
        validCandles.push(candle);
        batchLastTimestamp = candle.timestamp;
      }
      
      // Reverse to get chronological order (oldest first)
      allCandles = validCandles.reverse().concat(allCandles);
      
      // Set endTime for next batch (go backward in time)
      if (validCandles.length > 0) {
        endTime = validCandles[0].timestamp - 1;
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
  
  // Remove only exact timestamp duplicates (not sequential validation)
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
  
  console.log(`✅ Total candles fetched: ${finalCandles.length}`);
  console.log(`📊 Quality report:`);
  console.log(`   - Invalid candles filtered: ${invalidCandles}`);
  console.log(`   - Duplicates removed: ${duplicatesFound}`);
  console.log(`   - Final valid candles: ${finalCandles.length}`);
  
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

async function getCandlesFromRedis() {
  const key = 'ETHUSD_HISTORICAL_CANDLES';
  try {
    const data = await redisClient.get(key);
    if (data) {
      const candles = JSON.parse(data);
      console.log(`✅ Found ${candles.length} candles in Redis cache`);
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
            index: i,
            timestampLocal: convertTimestampToLima(candles[i].timestamp),
            confidence: result.confidence,
            meta: result.meta,
            typicalPrediction: detector.spec.typicalPrediction,
            commonContext: detector.spec.commonContext
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
 * Beautiful PDF Generation Functions
 */
async function generateCategoryReports(detections) {
  const categories = ['single-candle', 'double-candle', 'triple-candle', 'chart-patterns'];
  
  for (const category of categories) {
    const categoryDetections = detections.filter(d => d.type === category);
    if (categoryDetections.length > 0) {
      await generateCategoryPDF(category, categoryDetections);
    }
  }
}

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
     .text('📊 SUMMARY STATISTICS', 50, y);
  
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
     .text('🎯 PATTERN BREAKDOWN', 50, y);
  
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
  
  // Detailed detections (first 50 for brevity)
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('📋 DETAILED DETECTIONS (Top 50)', 50, y);
  
  y += 30;
  
  const limitedDetections = detections
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 50);
  
  limitedDetections.forEach((detection, index) => {
    // Detection header
    doc.fillColor('#34495e')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(`${index + 1}. ${detection.name.replace(/-/g, ' ').toUpperCase()}`, 70, y);
    
    y += 20;
    
    // Details in a nice box
    const boxY = y;
    const boxHeight = 80;
    
    doc.rect(70, boxY, 450, boxHeight)
       .fill('#f8f9fa')
       .stroke('#bdc3c7');
    
    doc.fillColor('#2c3e50')
       .fontSize(10)
       .font('Helvetica')
       .text(`📅 Time: ${detection.timestampLocal}`, 80, boxY + 10);
    
    doc.text(`📍 Index: ${detection.index}`, 80, boxY + 25);
    doc.text(`🎯 Prediction: ${detection.typicalPrediction}`, 80, boxY + 40);
    doc.text(`💡 Context: ${detection.commonContext}`, 80, boxY + 55);
    
    // Confidence with color coding
    const confPercent = (detection.confidence * 100).toFixed(1);
    const confColor = detection.confidence > 0.8 ? '#27ae60' : detection.confidence > 0.6 ? '#f39c12' : '#e74c3c';
    
    doc.fillColor(confColor)
       .font('Helvetica-Bold')
       .text(`🎲 Confidence: ${confPercent}%`, 300, boxY + 25);
    
    y += boxHeight + 20;
    
    // Pagination
    if (y > 600) {
      doc.addPage();
      y = 50;
    }
  });
  
  // Footer
  try {
    const pageRange = doc.bufferedPageRange();
    if (pageRange && pageRange.count > 0) {
      const pageCount = pageRange.count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fillColor('#95a5a6')
           .fontSize(10)
           .text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })} | Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 30);
        
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
      const pageCount = pageRange.count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        
        doc.fillColor('#95a5a6')
           .fontSize(10)
           .text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })} | Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 30);
        
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
  initializeRedis,
  fetchHistoricalData,
  fetchHistoricalDataWithValidation,
  storeCandlesInRedis,
  getCandlesFromRedis,
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

// Run if called directly
if (require.main === module) {
  const args = parseArgs();
  runPatternBacktest(args.force).catch(console.error);
}