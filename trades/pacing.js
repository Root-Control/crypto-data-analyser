/**
 * Pacing System for 15m signals
 * Prevents signal clustering and reduces wear from consecutive signals
 */

const PACING_CONFIG = {
  minSpacingBars: 4,        // 1 hour = 4 bars of 15m
  cooldownSideBars: 1,      // 15 minutes = 1 bar
  maxSignals4h: 2,          // Max 2 signals per 4-hour window
  antiReverseBars: 6,       // 6 bars after SL before allowing reverse
  window4hBars: 16          // 4 hours = 16 bars of 15m
};

/**
 * Apply pacing rules to filter signals
 * @param {Array} candidates - Array of signal candidates sorted by priority
 * @param {Array} candles - Array of candles for time calculations
 * @param {Array} emittedSignals - Previously emitted signals
 * @returns {Object} - { picked: Array, rejected: Array, pacingStats: Object }
 */
function applyPacingRules(candidates, candles, emittedSignals = []) {
  const pacingStats = {
    removedByMinSpacing: 0,
    removedByCooldownSide: 0,
    removedByRateLimit4h: 0,
    blockedReverseAfterSL: 0,
    removedBySameBar: 0
  };

  const picked = [];
  const rejected = [];

  // Helper function to get candle index from timestamp
  const getCandleIndex = (timestamp) => {
    return candles.findIndex(c => c.openTime === timestamp);
  };

  // Helper function to check if two timestamps are in the same bar
  const isSameBar = (ts1, ts2) => {
    const bar1 = getCandleIndex(ts1);
    const bar2 = getCandleIndex(ts2);
    return bar1 === bar2 && bar1 !== -1;
  };

  // Helper function to get bars difference between two timestamps
  const getBarsDifference = (ts1, ts2) => {
    const bar1 = getCandleIndex(ts1);
    const bar2 = getCandleIndex(ts2);
    if (bar1 === -1 || bar2 === -1) return Infinity;
    return Math.abs(bar2 - bar1);
  };

  // Helper function to count signals in 4h window
  const countSignalsIn4hWindow = (candidateTime, signals) => {
    const candidateBar = getCandleIndex(candidateTime);
    if (candidateBar === -1) return 0;
    
    return signals.filter(signal => {
      const signalBar = getCandleIndex(signal.dtISO ? new Date(signal.dtISO).getTime() : signal.openTime);
      if (signalBar === -1) return false;
      return Math.abs(candidateBar - signalBar) <= PACING_CONFIG.window4hBars;
    }).length;
  };

  // Helper function to check if last signal closed by SL
  const getLastSignalExitReason = (signals) => {
    if (signals.length === 0) return null;
    const lastSignal = signals[signals.length - 1];
    return lastSignal.exit_reason || lastSignal.exitReason || null;
  };

  // Helper function to get last signal of same side
  const getLastSignalOfSide = (side, signals) => {
    for (let i = signals.length - 1; i >= 0; i--) {
      if (signals[i].side === side) {
        return signals[i];
      }
    }
    return null;
  };

  for (const candidate of candidates) {
    let rejectedReason = null;
    const candidateTime = candidate.dtISO ? new Date(candidate.dtISO).getTime() : candidate.openTime;

    // Rule 1: No same bar
    if (picked.length > 0) {
      const lastPicked = picked[picked.length - 1];
      const lastPickedTime = lastPicked.dtISO ? new Date(lastPicked.dtISO).getTime() : lastPicked.openTime;
      
      if (isSameBar(candidateTime, lastPickedTime)) {
        rejectedReason = 'sameBar';
        pacingStats.removedBySameBar++;
      }
    }

    // Rule 2: Cooldown by side (15 minutes = 1 bar) - check against ALL previous signals of same side
    if (!rejectedReason) {
      const lastSameSide = getLastSignalOfSide(candidate.side, [...picked, ...emittedSignals]);
      if (lastSameSide) {
        const lastSameSideTime = lastSameSide.dtISO ? new Date(lastSameSide.dtISO).getTime() : lastSameSide.openTime;
        const barsDiff = getBarsDifference(candidateTime, lastSameSideTime);
        
        if (barsDiff < PACING_CONFIG.cooldownSideBars) {
          rejectedReason = 'cooldownSide';
          pacingStats.removedByCooldownSide++;
        }
      }
    }

    // Rule 3: Min spacing (1 hour = 4 bars) - check against last picked signal
    if (!rejectedReason && picked.length > 0) {
      const lastPicked = picked[picked.length - 1];
      const lastPickedTime = lastPicked.dtISO ? new Date(lastPicked.dtISO).getTime() : lastPicked.openTime;
      const barsDiff = getBarsDifference(candidateTime, lastPickedTime);
      
      if (barsDiff < PACING_CONFIG.minSpacingBars) {
        rejectedReason = 'minSpacing';
        pacingStats.removedByMinSpacing++;
      }
    }

    // Rule 4: Rate limit 4h (max 2 signals per 4h window)
    if (!rejectedReason) {
      const signalsInWindow = countSignalsIn4hWindow(candidateTime, [...picked, ...emittedSignals]);
      if (signalsInWindow >= PACING_CONFIG.maxSignals4h) {
        rejectedReason = 'rateLimit4h';
        pacingStats.removedByRateLimit4h++;
      }
    }

    // Rule 5: Anti-reverse after SL (6 bars)
    if (!rejectedReason) {
      const lastExitReason = getLastSignalExitReason([...picked, ...emittedSignals]);
      if (lastExitReason === 'SL') {
        const lastSignal = [...picked, ...emittedSignals].slice(-1)[0];
        const lastSignalTime = lastSignal.dtISO ? new Date(lastSignal.dtISO).getTime() : lastSignal.openTime;
        const barsDiff = getBarsDifference(candidateTime, lastSignalTime);
        
        // Check if this is a reverse signal (opposite side)
        const lastSignalSide = lastSignal.side;
        const isReverse = (lastSignalSide === 'LONG' && candidate.side === 'SHORT') || 
                        (lastSignalSide === 'SHORT' && candidate.side === 'LONG');
        
        if (isReverse && barsDiff <= PACING_CONFIG.antiReverseBars) {
          rejectedReason = 'reverseAfterSL';
          pacingStats.blockedReverseAfterSL++;
        }
      }
    }

    // Add to appropriate array
    if (rejectedReason) {
      rejected.push({
        ...candidate,
        pacingRejectionReason: rejectedReason
      });
    } else {
      picked.push(candidate);
    }
  }

  return {
    picked,
    rejected,
    pacingStats
  };
}

/**
 * Calculate pacing intervals for reporting
 * @param {Array} signals - Array of emitted signals
 * @param {Array} candles - Array of candles
 * @returns {Array} - Signals with interval information
 */
function calculatePacingIntervals(signals, candles) {
  const getCandleIndex = (timestamp) => {
    return candles.findIndex(c => c.openTime === timestamp);
  };

  const getMinutesBetween = (ts1, ts2) => {
    const bar1 = getCandleIndex(ts1);
    const bar2 = getCandleIndex(ts2);
    if (bar1 === -1 || bar2 === -1) return null;
    return Math.abs(bar2 - bar1) * 15; // 15 minutes per bar
  };

  return signals.map((signal, index) => {
    const signalTime = signal.dtISO ? new Date(signal.dtISO).getTime() : signal.openTime;
    
    if (index === 0) {
      return {
        ...signal,
        intervalFromPrevious: null,
        pacingInfo: 'First signal'
      };
    }

    const previousSignal = signals[index - 1];
    const previousTime = previousSignal.dtISO ? new Date(previousSignal.dtISO).getTime() : previousSignal.openTime;
    const intervalMinutes = getMinutesBetween(signalTime, previousTime);

    return {
      ...signal,
      intervalFromPrevious: intervalMinutes,
      pacingInfo: `${intervalMinutes} minutes from previous`
    };
  });
}

module.exports = {
  applyPacingRules,
  calculatePacingIntervals,
  PACING_CONFIG
};
