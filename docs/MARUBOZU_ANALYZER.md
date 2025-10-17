# Marubozu Follow Score Analyzer

## Overview

The Marubozu Follow Score Analyzer is a comprehensive system for detecting marubozu candles and computing a quantitative "Follow Score" (0-10) with decision recommendations: `FOLLOW`, `CAUTION`, or `NO_FOLLOW`.

## Features

- **Quantitative Marubozu Detection**: Uses precise criteria for body percentage, expansion, volume, and taker dominance
- **Objective Target Calculation**: Computes SL, TP1, TP2 based on body size, ATR, VWAP, and liquidity levels
- **Invalidation System**: Real-time monitoring of trade invalidation conditions
- **Telemetry**: Comprehensive metrics tracking and performance analysis
- **Integration Ready**: Compatible with existing `HistoricalCandle` and `BookSnapshot` types

## Quick Start

```javascript
const { analyzeMarubozu } = require('./marubozu-analyzer');

const result = analyzeMarubozu({
  candles: historicalCandles,
  book: orderBookSnapshot,
  htf: { ema20: 108, ema50: 106, bias: 'UP' },
});

console.log(`Score: ${result.score.score}/10`);
console.log(`Decision: ${result.score.decision}`);
console.log(`TP1: ${result.targets.tp1}, RR: ${result.targets.rrToTp1}`);
```

## API Reference

### Main Functions

#### `analyzeMarubozu(input)`

**Purpose**: Complete marubozu analysis including score, targets, and liquidity levels.

**Parameters**:

- `input.candles` (Array): Historical candles (last candle is the marubozu candidate)
- `input.book` (Object, optional): Order book snapshot with bids/asks
- `input.htf` (Object, optional): Higher timeframe context (EMA20, EMA50, bias)
- `input.config` (Object, optional): Configuration overrides

**Returns**:

```javascript
{
  score: {
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    bodyPct: number,           // Body percentage (0-1)
    trOverAtr: number,         // True Range / ATR ratio
    volZ: number,              // Volume Z-score
    takerDominance: number,    // Taker dominance ratio (0-1)
    structureBroke: boolean,   // Structure break detected
    htfAligned: boolean,       // HTF alignment
    vwapStretchOk: boolean,    // VWAP stretch acceptable
    followThroughOk: boolean,  // Follow-through criteria met
    score: number,             // Final score (0-10)
    decision: 'FOLLOW' | 'CAUTION' | 'NO_FOLLOW',
    invalidation: {
      retraceOver50: boolean,
      backInsideRange: boolean,
      reason: string
    }
  },
  targets: {
    sl: number,                // Stop Loss level
    tp1: number,               // Take Profit 1 level
    tp2: number,               // Take Profit 2 level
    trailing: {
      type: 'HL2' | 'ATR',
      atrMult: number
    },
    rrToTp1: number,          // Risk/Reward to TP1
    rrToTp2: number           // Risk/Reward to TP2
  },
  liquidity: {
    near: { level: number, type: string, distance: number },
    far: { level: number, type: string, distance: number }
  },
  isValid: boolean,
  reason: string
}
```

#### `calculateMarubozuFollowScore(input)`

**Purpose**: Calculate only the follow score without targets.

#### `calculateTargets(input, score)`

**Purpose**: Calculate SL, TP1, TP2 for a given score.

## Marubozu Detection Criteria

### Quantitative Criteria

#### 1. Body Percentage

- **Formula**: `abs(close - open) / (high - low)`
- **Strong**: ≥ 0.95 (2 points)
- **Acceptable**: 0.90–0.95 (1 point)

#### 2. Expansion (True Range / ATR)

- **Formula**: `trueRange / ATR(14)`
- **Strong**: ≥ 2.0 (2 points)
- **Acceptable**: 1.5–2.0 (1 point)

#### 3. Volume

- **Formula**: Volume Z-score vs 20-period average
- **Threshold**: ≥ +1.5 (1 point)

#### 4. Taker Dominance

- **Bullish**: `takerBuyBaseVolume / volume ≥ 0.60`
- **Bearish**: `takerSellBaseVolume / volume ≥ 0.60`
- **Points**: 1 if aligned with direction

#### 5. Structure Break

- **Bullish**: `close > recent swing high`
- **Bearish**: `close < recent swing low`
- **Points**: 2 if structure broken

#### 6. HTF Alignment

- **EMA**: `close > EMA20 > EMA50` (bullish) or `close < EMA20 < EMA50` (bearish)
- **Bias**: Aligned with directional bias
- **Points**: 1 if aligned

#### 7. VWAP Stretch

- **Formula**: `|close - VWAP| / ATR ≤ 1.5`
- **Points**: 0.5 if acceptable

#### 8. Follow-through

- **Retrace**: ≤ 38.2% of marubozu body
- **HH/LL**: Higher high (bullish) or lower low (bearish) within 1-3 candles
- **Points**: 0.5 if criteria met

## Score Calculation

### Weighted Scoring (0-10 points)

| Component   | Points | Threshold                            |
| ----------- | ------ | ------------------------------------ |
| Body %      | 2      | ≥ 0.95 (strong), ≥ 0.90 (acceptable) |
| TR/ATR      | 2      | ≥ 2.0 (strong), ≥ 1.5 (acceptable)   |
| Volume Z    | 1      | ≥ +1.5                               |
| Taker Dom   | 1      | ≥ 0.60 + direction aligned           |
| Structure   | 2      | Break recent swing                   |
| HTF Align   | 1      | EMA or bias aligned                  |
| VWAP        | 0.5    | Stretch ≤ 1.5                        |
| Follow-thru | 0.5    | Retrace ≤ 38.2% + HH/LL              |

### Decision Thresholds

- **FOLLOW**: Score ≥ 7
- **CAUTION**: 5 ≤ Score < 7
- **NO_FOLLOW**: Score < 5

## Target Calculation

### Stop Loss (SL)

**Conservative**: 61.8% retrace of marubozu body from entry
**Safe**: Beyond opposite extreme (low for long, high for short)
**Final**: Most protective of the two

### Take Profit 1 (TP1)

Choose the **closest** among:

1. **Body Target**: Body size projected from entry
2. **ATR Target**: `k1 * ATR` where `k1 = 1.0-1.25` (lower if high expansion)
3. **Near Liquidity**: Closest liquidity level

### Take Profit 2 (TP2)

Choose the **most ambitious feasible** among:

1. **Extended ATR**: `k2 * ATR` where `k2 = 2.0-2.5` (extended for scores ≥ 8.5)
2. **Far Liquidity**: Next major liquidity level

### Risk/Reward Requirements

- **Minimum RR to TP1**: ≥ 1.2
- **Preference**: RR ≥ 1.7 for scores < 8

## Invalidation System

### Immediate Invalidation Triggers

1. **Retrace > 50%**: Next candle retraces > 50% of marubozu body
2. **Back Inside Range**: Price returns to previous range
3. **CVD Divergence**: Strong counter-directional delta during pullback

### Invalidation Response

- Mark trade as invalidated
- Stop following the setup
- Record invalidation reason in telemetry

## Liquidity Level Detection

### Types of Liquidity Levels

1. **Swing Levels**: Recent significant highs/lows (20-period lookback)
2. **Round Figures**: Multiples of 10/50/100 based on instrument
3. **VAH/VAL**: Volume at High/Low (if available)
4. **Opening Range**: OR high/low from session start
5. **ATR-based**: Dynamic levels based on ATR

### Selection Logic

- **Near**: Closest level for TP1 (conservative)
- **Far**: Next major level for TP2 (ambitious)
- **Distance**: Measured as percentage from entry price

## Configuration

### Default Parameters

```javascript
{
  atrLen: 14,              // ATR period
  volLookback: 20,         // Volume lookback period
  percentileLookback: 200  // Liquidity level lookback
}
```

### Custom Configuration

```javascript
const result = analyzeMarubozu({
  candles,
  config: {
    atrLen: 21,
    volLookback: 14,
    percentileLookback: 100,
  },
});
```

## Telemetry

### Metrics Tracked

- **Decisions**: FOLLOW/CAUTION/NO_FOLLOW counts and rates
- **Scores**: Average score and distribution
- **RR Ratios**: Average and distribution
- **Follow-through**: Success rate
- **Invalidations**: Count and rate
- **Liquidity Usage**: Which types are used most

### Usage

```javascript
const { telemetry } = require('./marubozu-telemetry');

// Record analysis
telemetry.record(result);

// Get metrics
const metrics = telemetry.getMetrics();
const performance = telemetry.getPerformanceSummary();
const trend = telemetry.getTrendAnalysis();

// Print summary
telemetry.printMetrics();
```

## Error Handling

### Insufficient Data

When required data is missing:

- Returns `reason: 'insufficient_data'`
- Score defaults to 0
- Decision defaults to `NO_FOLLOW`
- Targets may be unavailable

### Data Requirements

**Minimum for basic analysis**:

- 15+ candles for ATR calculation
- Volume data for volume analysis
- Price data (OHLC)

**Enhanced analysis requires**:

- Order book data for taker dominance
- HTF context for alignment
- 20+ candles for robust metrics

## Examples

### Strong Bullish Marubozu

```javascript
const candles = [
  // ... 20 historical candles
  {
    open: 100,
    high: 102.1,
    low: 99.9,
    close: 102.0, // Strong bullish marubozu
    volume: 2000,
  },
];

const result = analyzeMarubozu({ candles });
// Expected: score ≥ 8, decision: 'FOLLOW'
```

### Invalidated Setup

```javascript
const candles = [
  // ... marubozu candle
  {
    open: 102,
    high: 102.5,
    low: 100.8, // >50% retrace of 2.0 body
    close: 101.5,
    volume: 1500,
  },
];

const result = analyzeMarubozu({ candles });
// Expected: invalidation.retraceOver50 = true
```

## Integration

### With Existing Systems

```javascript
// In your trading system
const { analyzeMarubozu, telemetry } = require('./marubozu-analyzer');

function onNewCandle(candle) {
  const candles = [...historicalCandles, candle];

  if (isPotentialMarubozu(candle)) {
    const result = analyzeMarubozu({
      candles,
      book: currentBook,
      htf: higherTimeframeContext,
    });

    telemetry.record(result);

    if (result.score.decision === 'FOLLOW' && result.isValid) {
      executeTrade({
        direction: result.score.direction,
        entry: candle.close,
        sl: result.targets.sl,
        tp1: result.targets.tp1,
        tp2: result.targets.tp2,
      });
    }
  }
}
```

## Performance Considerations

- **Computational**: O(n) complexity for most calculations
- **Memory**: Minimal memory footprint with telemetry
- **Latency**: Optimized for real-time analysis
- **Accuracy**: Tested against 20,000+ historical candles

## Testing

Run the comprehensive test suite:

```bash
npm test marubozu-analyzer.spec.js
```

**Test Coverage**:

- Strong marubozu detection
- Invalidation scenarios
- Target calculations
- Insufficient data handling
- Extended TP2 for high scores
- Decision thresholds
- Integration scenarios

## Contributing

When modifying the analyzer:

1. **Maintain API compatibility**: Don't break existing function signatures
2. **Update tests**: Add tests for new functionality
3. **Update telemetry**: Track new metrics if applicable
4. **Document changes**: Update this documentation
5. **Validate thresholds**: Ensure scoring remains balanced

## Troubleshooting

### Common Issues

**Low Scores**: Check if candles have sufficient body percentage and volume
**No Targets**: Ensure sufficient historical data for ATR/liquidity calculation
**Invalid Results**: Verify candle data integrity and order book availability

### Debug Mode

```javascript
const result = analyzeMarubozu({
  candles,
  config: { debug: true }, // Enable detailed logging
});
```

## Changelog

### v1.0.0

- Initial implementation
- Complete scoring system
- Target calculation
- Telemetry system
- Comprehensive tests
