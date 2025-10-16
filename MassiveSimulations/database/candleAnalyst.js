const mongoose = require('mongoose');

// Esquema CandleAnalyst (igual que CandleAnalyser del servidor)
const candleAnalystSchema = new mongoose.Schema({
  pair: { type: String, required: true },
  startDate: { type: String, required: true },
  startTime: { type: String, required: true },
  endDate: { type: String, required: true },
  endTime: { type: String, required: true },
  status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
  analysis: [{
    minute: { type: String, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    fluct: { type: Number, required: true },
    tickVol: { type: Number, required: true },
    buyVol: { type: Number, required: true },
    sellVol: { type: Number, required: true },
    delta: { type: Number, required: true },
    imbalance: { type: Number, required: true },
    vwap: { type: Number, required: true },
    tickCount: { type: Number, required: true },
    flags: { type: Number, required: true },
    book: {
      symbol: { type: String, required: true },
      timestamp: { type: Number, required: true },
      lastUpdateId: { type: Number, required: true },
      bids: [{ type: [String] }],
      asks: [{ type: [String] }],
      spread: { type: Number, required: true },
      spreadPct: { type: Number, required: true },
      midPrice: { type: Number, required: true },
      totalBidQty: { type: Number, required: true },
      totalAskQty: { type: Number, required: true },
      imbalance: { type: Number, required: true }
    }
  }]
}, {
  collection: 'candleanalysers' // Nombre de la colección en MongoDB
});

// Crear el modelo
const CandleAnalyst = mongoose.model('CandleAnalyst', candleAnalystSchema);

module.exports = CandleAnalyst;
