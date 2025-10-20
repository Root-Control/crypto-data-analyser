// Fixed calculation utilities for v6.6.2

function calculateLongRiskReward(entry, sl, tp1, tp2) {
  const risk_abs = entry - sl;
  const reward_abs = tp1 - entry;
  const rr = reward_abs / risk_abs;
  const slPct = (sl / entry - 1) * 100;
  const tp1Pct = (tp1 / entry - 1) * 100;
  const tp2Pct = tp2 ? (tp2 / entry - 1) * 100 : undefined;
  return { risk_abs, reward_abs, rr, slPct, tp1Pct, tp2Pct };
}

function calculateShortRiskReward(entry, sl, tp1, tp2) {
  const risk_abs = sl - entry;
  const reward_abs = entry - tp1;
  const rr = reward_abs / risk_abs;
  const slPct = (sl / entry - 1) * 100; // For SHORT: SL > entry, so this should be positive
  const tp1Pct = (entry - tp1) / entry * 100; // For SHORT: entry > tp1, so this should be positive
  const tp2Pct = tp2 ? (entry - tp2) / entry * 100 : undefined;
  return { risk_abs, reward_abs, rr, slPct, tp1Pct, tp2Pct };
}

function calculatePnLAndROI(entry, tp1, side, capital = 400, leverage = 10, isTaker = true) {
  const nocional = capital * leverage;
  const roundTripBps = isTaker ? 10 : 4; // 0.10% vs 0.04%
  const slippageBps = 2; // 0.02%
  
  let pnlBruto;
  if (side === 'LONG') {
    pnlBruto = nocional * ((tp1 - entry) / entry);
  } else {
    pnlBruto = nocional * ((entry - tp1) / entry);
  }
  
  const fees = nocional * (roundTripBps / 10000);
  const slippage = nocional * (slippageBps / 10000);
  const pnlNeto = pnlBruto - fees - slippage;
  const roiNeto = pnlNeto / capital; // ROI is calculated on capital, not nocional
  
  return { pnlBruto, fees, slippage, pnlNeto, roiNeto };
}

function calculateNextCandleMovement(entry, nextCandle) {
  if (!nextCandle) return null;
  
  const up1Pct = ((nextCandle.high - entry) / entry) * 100;
  const down1Pct = ((entry - nextCandle.low) / entry) * 100;
  const wickLow = Math.max(0, entry - nextCandle.low);
  const wickLowPct = (wickLow / entry) * 100;
  const closeDeltaPct = ((nextCandle.close - entry) / entry) * 100;
  
  return { up1Pct, down1Pct, wickLow, wickLowPct, closeDeltaPct };
}

module.exports = {
  calculateLongRiskReward,
  calculateShortRiskReward,
  calculatePnLAndROI,
  calculateNextCandleMovement
};
