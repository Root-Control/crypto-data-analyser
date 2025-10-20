// Utility functions for hardened reporting v6.6.2

const NOTIONAL_USD = 4000; // capital 400 * 10x
const CAPITAL_USD = 400;

// RR minimum enforcement with TP1 recalculation
function enforceRRMinimum(side, entry, sl, tp1, rrMin) {
  const slDist = Math.abs(entry - sl);
  const tpDist = Math.abs(tp1 - entry);
  const currentRR = tpDist / slDist;
  
  if (currentRR >= rrMin) {
    return { tp1, rr_real: currentRR, tp1Recalc: false };
  }
  
  // Recalculate TP1 to meet RR_MIN while keeping SL
  const requiredTpDist = slDist * rrMin;
  const newTp1 = side === 'LONG' ? entry + requiredTpDist : entry - requiredTpDist;
  
  return { tp1: newTp1, rr_real: rrMin, tp1Recalc: true };
}

// Calculate absolute percentages (always positive)
function calculateAbsPercentages(side, entry, sl, tp1, tp2 = null) {
  const slPctAbs = Math.abs((sl - entry) / entry) * 100;
  const tp1PctAbs = Math.abs((tp1 - entry) / entry) * 100;
  const tp2PctAbs = tp2 ? Math.abs((tp2 - entry) / entry) * 100 : null;
  
  return { slPctAbs, tp1PctAbs, tp2PctAbs };
}

// Calculate signed percentages for gross_pct_at_TP1/SL
function calculateSignedPercentages(side, entry, sl, tp1) {
  const tp1PctSigned = side === 'LONG' ? ((tp1 - entry) / entry) * 100 : ((entry - tp1) / entry) * 100;
  const slPctSigned = side === 'LONG' ? ((sl - entry) / entry) * 100 : ((sl - entry) / entry) * 100;
  
  return { tp1PctSigned, slPctSigned };
}

// Deterministic tie resolution
function evaluateExitWithTieResolution(side, entry, sl, tp1, window) {
  const H = 5;
  const pathArr = [];
  let exit = null;
  let tieCase = false;
  let tieResolved = null;
  
  for (let i = 0; i < H; i += 1) {
    const c = window[i];
    if (!c) break;
    
    const barOffset = i + 1;
    const hitTP = side === 'LONG' ? (c.high >= tp1) : (c.low <= tp1);
    const hitSL = side === 'LONG' ? (c.low <= sl) : (c.high >= sl);
    
    let hit = null;
    if (hitTP && hitSL) {
      tieCase = true;
      // Deterministic resolution: LONG checks High first, SHORT checks Low first
      if (side === 'LONG') {
        // LONG: High first, then Low - if both hit, prefer SL (adverse first)
        tieResolved = 'SL';
        hit = 'SL';
        if (!exit) exit = { exit_reason: 'SL', exit_price: sl, bars_to_exit: barOffset };
      } else {
        // SHORT: Low first, then High - if both hit, prefer SL (adverse first)
        tieResolved = 'SL';
        hit = 'SL';
        if (!exit) exit = { exit_reason: 'SL', exit_price: sl, bars_to_exit: barOffset };
      }
    } else if (hitTP) {
      hit = 'TP';
      if (!exit) exit = { exit_reason: 'TP', exit_price: tp1, bars_to_exit: barOffset };
    } else if (hitSL) {
      hit = 'SL';
      if (!exit) exit = { exit_reason: 'SL', exit_price: sl, bars_to_exit: barOffset };
    }
    
    pathArr.push({ barOffset, high: c.high, low: c.low, hit });
    if (exit) break;
  }
  
  // Always complete window to H length for audit
  for (let i = pathArr.length; i < H; i += 1) {
    const c = window[i];
    if (!c) break;
    pathArr.push({ barOffset: i + 1, high: c.high, low: c.low, hit: null });
  }
  
  // EXP: close at bar H close if neither hit
  if (!exit) {
    const last = window[Math.min(H, window.length) - 1];
    exit = { exit_reason: 'EXP', exit_price: last ? last.close : entry, bars_to_exit: Math.min(H, window.length) };
  }
  
  return { exit, pathArr, tieCase, tieResolved };
}

function grossPct(side, entry, exitPrice) {
  const raw = (exitPrice / entry) - 1;
  return side === 'LONG' ? raw : -raw;
}

function calculateCostsAndROI(grossPct) {
  const takerCost = 0.0010 + 0.0002; // 10 bps + 2 bps slippage
  const makerCost = 0.0004 + 0.0002; // 4 bps + 2 bps slippage
  
  const netPctTaker = grossPct - takerCost;
  const netPctMaker = grossPct - makerCost;
  
  const netUsdTaker = NOTIONAL_USD * netPctTaker;
  const netUsdMaker = NOTIONAL_USD * netPctMaker;
  
  const roiCapitalTaker = (netUsdTaker / CAPITAL_USD) * 100;
  const roiCapitalMaker = (netUsdMaker / CAPITAL_USD) * 100;
  
  return {
    net_pct_taker: netPctTaker * 100,
    net_usd_taker: netUsdTaker,
    net_pct_maker: netPctMaker * 100,
    net_usd_maker: netUsdMaker,
    roi_on_capital_taker: roiCapitalTaker,
    roi_on_capital_maker: roiCapitalMaker,
  };
}

function calculateQuantiles(arr) {
  if (!arr.length) return { p25: null, p50: null, p75: null };
  const sorted = [...arr].sort((x, y) => x - y);
  const q = (p) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const w = idx - lo;
    return sorted[lo] * (1 - w) + sorted[hi] * w;
  };
  return { p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}

module.exports = {
  enforceRRMinimum,
  calculateAbsPercentages,
  calculateSignedPercentages,
  evaluateExitWithTieResolution,
  grossPct,
  calculateCostsAndROI,
  calculateQuantiles
};
