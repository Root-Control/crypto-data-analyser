/**
 * Pattern Backtesting System
 * Evaluates the effectiveness of pattern detections with stop loss and take profit
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

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

/**
 * Backtest a pattern detection
 * @param {Object} detection - The pattern detection
 * @param {Array} allCandles - All 20,000 candles
 * @param {Object} options - Backtest options
 */
function backtestPattern(detection, allCandles, options = {}) {
  const {
    stopLossPercent = 0.01, // 1%
    takeProfitPercent = 0.01, // 1%
    evaluationCandles = 10 // Evaluate next 10 candles
  } = options;

  const signalIndex = detection.index;
  const signalCandle = allCandles[signalIndex];
  
  // Determine if pattern is bullish or bearish based on pattern type and candle
  const isBullish = determinePatternDirection(detection, signalCandle);
  
  // Entry price is the close of the signal candle
  const entryPrice = signalCandle.close;
  
  // Calculate stop loss and take profit levels
  const stopLossPrice = isBullish 
    ? entryPrice * (1 - stopLossPercent) // Below entry for long
    : entryPrice * (1 + stopLossPercent); // Above entry for short
    
  const takeProfitPrice = isBullish
    ? entryPrice * (1 + takeProfitPercent) // Above entry for long
    : entryPrice * (1 - takeProfitPercent); // Below entry for short

  // Evaluate next candles
  let result = 'UNKNOWN';
  let triggerCandle = null;
  let triggerIndex = -1;
  let pnl = 0;
  let exitPrice = entryPrice; // Default to entry price
  
  // Check next evaluationCandles candles
  for (let i = 1; i <= evaluationCandles; i++) {
    const checkIndex = signalIndex + i;
    
    // Make sure we don't go beyond available candles
    if (checkIndex >= allCandles.length) {
      break;
    }
    
    const candle = allCandles[checkIndex];
    
    // Check if stop loss was hit
    if (isBullish) {
      // For bullish positions, check if low hit stop loss
      if (candle.low <= stopLossPrice) {
        result = 'LOSS';
        triggerCandle = candle;
        triggerIndex = checkIndex;
        pnl = calculatePnL(entryPrice, stopLossPrice, isBullish);
        exitPrice = stopLossPrice;
        break;
      }
      // Check if high hit take profit
      if (candle.high >= takeProfitPrice) {
        result = 'WIN';
        triggerCandle = candle;
        triggerIndex = checkIndex;
        pnl = calculatePnL(entryPrice, takeProfitPrice, isBullish);
        exitPrice = takeProfitPrice;
        break;
      }
    } else {
      // For bearish positions, check if high hit stop loss
      if (candle.high >= stopLossPrice) {
        result = 'LOSS';
        triggerCandle = candle;
        triggerIndex = checkIndex;
        pnl = calculatePnL(entryPrice, stopLossPrice, isBullish);
        exitPrice = stopLossPrice;
        break;
      }
      // Check if low hit take profit
      if (candle.low <= takeProfitPrice) {
        result = 'WIN';
        triggerCandle = candle;
        triggerIndex = checkIndex;
        pnl = calculatePnL(entryPrice, takeProfitPrice, isBullish);
        exitPrice = takeProfitPrice;
        break;
      }
    }
  }
  
  // If no SL/TP hit, calculate P&L at the end of evaluation period (vela 5)
  if (result === 'UNKNOWN') {
    const finalIndex = signalIndex + evaluationCandles;
    if (finalIndex < allCandles.length) {
      const finalCandle = allCandles[finalIndex];
      exitPrice = finalCandle.close; // Use close price of the 5th candle
      pnl = calculatePnL(entryPrice, exitPrice, isBullish);
      triggerIndex = finalIndex;
      triggerCandle = finalCandle;
    }
  }

  return {
    detection,
    isBullish,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    exitPrice,
    result,
    triggerCandle,
    triggerIndex,
    pnl,
    evaluationCandles: Math.min(evaluationCandles, allCandles.length - signalIndex - 1)
  };
}

/**
 * Determine if a pattern is bullish or bearish
 */
function determinePatternDirection(detection, candle) {
  // For Marubozu patterns
  if (detection.name === 'marubozu') {
    // Marubozu is bullish if close > open (green candle)
    return candle.close > candle.open;
  }
  
  // For other patterns, use candle direction as fallback
  return candle.close > candle.open;
}

/**
 * Calculate P&L for a trade
 */
function calculatePnL(entryPrice, exitPrice, isBullish) {
  if (isBullish) {
    // Long position: profit when exit > entry
    return ((exitPrice - entryPrice) / entryPrice) * 100; // Return as percentage
  } else {
    // Short position: profit when exit < entry
    return ((entryPrice - exitPrice) / entryPrice) * 100; // Return as percentage
  }
}

/**
 * Backtest all detections for a specific pattern
 */
function backtestPatternDetections(detections, allCandles, options = {}) {
  const results = [];
  
  for (const detection of detections) {
    const backtestResult = backtestPattern(detection, allCandles, options);
    results.push(backtestResult);
  }
  
  return results;
}

/**
 * Generate backtest statistics
 */
function generateBacktestStats(backtestResults) {
  const total = backtestResults.length;
  const wins = backtestResults.filter(r => r.result === 'WIN' || (r.result === 'UNKNOWN' && r.pnl > 0)).length;
  const losses = backtestResults.filter(r => r.result === 'LOSS' || (r.result === 'UNKNOWN' && r.pnl < 0)).length;
  const unknowns = backtestResults.filter(r => r.result === 'UNKNOWN' && r.pnl === 0).length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const lossRate = total > 0 ? (losses / total) * 100 : 0;
  const unknownRate = total > 0 ? (unknowns / total) * 100 : 0;
  
  // Calculate average P&L for wins and losses (including UNKNOWN with P&L)
  const winResults = backtestResults.filter(r => r.result === 'WIN' || (r.result === 'UNKNOWN' && r.pnl > 0));
  const lossResults = backtestResults.filter(r => r.result === 'LOSS' || (r.result === 'UNKNOWN' && r.pnl < 0));
  
  const avgWinPnL = winResults.length > 0 
    ? winResults.reduce((sum, r) => sum + r.pnl, 0) / winResults.length 
    : 0;
    
  const avgLossPnL = lossResults.length > 0 
    ? lossResults.reduce((sum, r) => sum + r.pnl, 0) / lossResults.length 
    : 0;
  
  const totalPnL = backtestResults.reduce((sum, r) => sum + r.pnl, 0);
  
  return {
    total,
    wins,
    losses,
    unknowns,
    winRate,
    lossRate,
    unknownRate,
    avgWinPnL,
    avgLossPnL,
    totalPnL
  };
}

/**
 * Generate a backtest report PDF
 */
async function generateBacktestReport(patternName, backtestResults, stats, allCandles) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
  
  const reportsDir = path.join(__dirname, '..', 'Reports');
  
  // Determine if this is a single-candle pattern and create appropriate folder structure
  let filepath;
  if (patternName.includes('-win') || patternName.includes('-loss') || patternName.includes('-unknown')) {
    // For WIN/LOSS/UNKNOWN reports, extract base pattern name
    const basePattern = patternName.replace('-win', '').replace('-loss', '').replace('-unknown', '');
    const patternDir = path.join(reportsDir, 'single-candle', basePattern);
    if (!fs.existsSync(patternDir)) {
      fs.mkdirSync(patternDir, { recursive: true });
    }
    filepath = path.join(patternDir, `${patternName}.backtest.pdf`);
  } else {
    // For general backtest reports
    filepath = path.join(reportsDir, `${patternName}-backtest-report.pdf`);
  }
  
  doc.pipe(fs.createWriteStream(filepath));
  
  // Header
  doc.rect(0, 0, doc.page.width, 80)
     .fill('#2c3e50');
  
  // Customize title based on report type
  let title = `${patternName.toUpperCase()} BACKTEST REPORT`;
  let subtitle = `Pattern Performance Analysis with 1% Stop Loss & Take Profit (5 candles evaluation)`;
  
  if (patternName.includes('-win')) {
    title = `${patternName.replace('-win', '').toUpperCase()} WINNING TRADES`;
    subtitle = `Successful trades that hit Take Profit (1%)`;
  } else if (patternName.includes('-loss')) {
    title = `${patternName.replace('-loss', '').toUpperCase()} LOSING TRADES`;
    subtitle = `Failed trades that hit Stop Loss (1%)`;
  } else if (patternName.includes('-unknown')) {
    title = `${patternName.replace('-unknown', '').toUpperCase()} UNKNOWN TRADES`;
    subtitle = `Trades that didn't reach Stop Loss or Take Profit in 5 candles`;
  }
  
  doc.fillColor('#ffffff')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text(title, 50, 30);
  
  doc.fillColor('#ecf0f1')
     .fontSize(12)
     .font('Helvetica')
     .text(subtitle, 50, 55);
  
  // Statistics summary
  let y = 100;
  
  doc.rect(50, y, doc.page.width - 100, 120)
     .fill('#ecf0f1');
  
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('BACKTEST STATISTICS', 70, y + 10);
  
  y += 35;
  
  // Win/Loss stats - conditional based on report type
  if (patternName.includes('-unknown')) {
    // For UNKNOWN reports, only show total trades
    doc.fillColor('#95a5a6')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`TOTAL TRADES: ${stats.total}`, 70, y);
  } else {
    // For main reports, show all statistics
    doc.fillColor('#27ae60')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`WINS: ${stats.wins} (${stats.winRate.toFixed(1)}%)`, 70, y);
    
    doc.fillColor('#e74c3c')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`LOSSES: ${stats.losses} (${stats.lossRate.toFixed(1)}%)`, 200, y);
    
    doc.fillColor('#95a5a6')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`UNKNOWN: ${stats.unknowns} (${stats.unknownRate.toFixed(1)}%)`, 330, y);
  }
  
  y += 25;
  
  // P&L stats
  doc.fillColor('#2c3e50')
     .fontSize(12)
     .font('Helvetica')
     .text(`Total Trades: ${stats.total}`, 70, y);
  
  doc.fillColor('#27ae60')
     .fontSize(12)
     .font('Helvetica')
     .text(`Avg Win P&L: ${stats.avgWinPnL.toFixed(2)}%`, 200, y);
  
  doc.fillColor('#e74c3c')
     .fontSize(12)
     .font('Helvetica')
     .text(`Avg Loss P&L: ${stats.avgLossPnL.toFixed(2)}%`, 330, y);
  
  y += 20;
  
  // P&L stats - conditional based on report type
  if (!patternName.includes('-unknown')) {
    doc.fillColor('#2c3e50')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`Total P&L: ${stats.totalPnL.toFixed(2)}%`, 70, y);
    
    y += 50;
  } else {
    y += 30;
  }
  
  // Detailed results
  doc.fillColor('#2c3e50')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('DETAILED TRADE RESULTS', 50, y);
  
  y += 30;
  
  // Sort results by P&L for better visualization
  const sortedResults = backtestResults.sort((a, b) => b.pnl - a.pnl);
  
  for (let i = 0; i < sortedResults.length; i++) { // Show ALL results
    const result = sortedResults[i];
    const detection = result.detection;
    
    // Result box
    const boxColor = result.result === 'WIN' ? '#d5f4e6' : 
                     result.result === 'LOSS' ? '#fadbd8' : '#f8f9fa';
    
    doc.rect(50, y, doc.page.width - 100, 80)
       .fill(boxColor);
    
    doc.rect(50, y, doc.page.width - 100, 80)
       .stroke('#dee2e6');
    
    // Trade info
    doc.fillColor('#2c3e50')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text(`Trade #${i + 1}`, 60, y + 10);
    
    doc.fillColor('#495057')
       .fontSize(9)
       .font('Helvetica')
       .text(`Time: ${formatDateTime24h(detection.timestampLocal)}`, 60, y + 25);
    
    doc.text(`Index: ${detection.index}`, 60, y + 40);
    
    // Direction and entry
    const directionColor = result.isBullish ? '#27ae60' : '#e74c3c';
    const directionText = result.isBullish ? 'BULLISH' : 'BEARISH';
    
    doc.fillColor(directionColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text(directionText, 200, y + 25);
    
    doc.fillColor('#495057')
       .fontSize(9)
       .font('Helvetica')
       .text(`Entry: $${result.entryPrice.toFixed(2)}`, 200, y + 40);
    
    // Result and P&L with WIN/LOSS indicator
    let resultText = result.result;
    let resultColor = '#95a5a6';
    
    // For trades that were UNKNOWN, show the actual P&L result
    if (result.result === 'UNKNOWN') {
      if (result.pnl > 0) {
        resultText = 'PROFIT';
        resultColor = '#27ae60';
      } else if (result.pnl < 0) {
        resultText = 'LOSS';
        resultColor = '#e74c3c';
      } else {
        resultText = 'FLAT';
        resultColor = '#95a5a6';
      }
    } else if (result.result === 'WIN') {
      resultColor = '#27ae60';
    } else if (result.result === 'LOSS') {
      resultColor = '#e74c3c';
    }
    
    doc.fillColor(resultColor)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(resultText, 350, y + 15);
    
    doc.fillColor(resultColor)
       .fontSize(11)
       .font('Helvetica')
       .text(`${result.pnl.toFixed(2)}%`, 350, y + 30);
    
    // Add WIN/LOSS indicator and evaluation info in the trade info section
    const winLossText = result.isBullish ? 'LONG' : 'SHORT';
    const winLossColor = result.isBullish ? '#27ae60' : '#e74c3c';
    
    doc.fillColor(winLossColor)
       .fontSize(9)
       .font('Helvetica-Bold')
       .text(winLossText, 60, y + 60);
    
    // Show evaluation info for main reports
    if (!patternName.includes('-unknown')) {
      const evaluatedCandles = Math.max(0, result.triggerIndex - result.detection.index);
      doc.fillColor('#6c757d')
         .fontSize(8)
         .font('Helvetica')
         .text(`Evaluated: ${evaluatedCandles} candles`, 200, y + 60);
      
      if (result.result !== 'UNKNOWN') {
        doc.fillColor('#6c757d')
           .fontSize(8)
           .font('Helvetica')
           .text(`Trigger: ${result.triggerCandle ? new Date(result.triggerCandle.timestamp).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'N/A'}`, 200, y + 72);
      }
    }
    
    // Stop Loss and Take Profit levels
    // Show Entry/Exit for UNKNOWN, SL/TP for others
    if (result.result === 'UNKNOWN') {
      doc.fillColor('#6c757d')
         .fontSize(8)
         .font('Helvetica')
         .text(`Entry: $${result.entryPrice.toFixed(2)}`, 450, y + 25);
      
      doc.text(`Exit: $${result.exitPrice.toFixed(2)}`, 450, y + 40);
    } else {
      doc.fillColor('#6c757d')
         .fontSize(8)
         .font('Helvetica')
         .text(`SL: $${result.stopLossPrice.toFixed(2)}`, 450, y + 25);
      
      doc.text(`TP: $${result.takeProfitPrice.toFixed(2)}`, 450, y + 40);
    }
    
    // For UNKNOWN trades, add evaluation info
    if (result.result === 'UNKNOWN') {
      doc.fillColor('#f39c12')
         .fontSize(8)
         .font('Helvetica')
         .text(`Evaluated: ${result.evaluationCandles} candles`, 450, y + 55);
    }
    
    y += 90;
    
    // Pagination - better spacing
    if (y > 600) {
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
  console.log(`✅ Generated backtest report: ${filepath}`);
}

module.exports = {
  backtestPattern,
  backtestPatternDetections,
  generateBacktestStats,
  generateBacktestReport
};
