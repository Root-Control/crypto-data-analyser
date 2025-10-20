const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function fmt(n, decimals) {
  return Number(n).toFixed(decimals);
}

function formatLima(dt) {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(dt));
  } catch (_) {
    return new Date(dt).toISOString();
  }
}

function formatLimaDateOnly(dt) {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(dt));
  } catch (_) {
    const d = new Date(dt);
    return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth()+1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
}

function formatTzFull(dt, tz) {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: tz,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(new Date(dt));
  } catch (_) {
    return new Date(dt).toISOString();
  }
}

function drawHeader(doc, title, info) {
  doc.fontSize(18).text(title, { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(9).text(`Generado (Lima): ${formatLima(Date.now())}`);
  doc.moveDown(0.3);
  doc.fontSize(12).text('INFORMACIÓN GENERAL');
  doc.moveDown(0.15);
  doc.fontSize(9)
    .text(`Moneda: ${info.symbol}`)
    .text(`Total de señales emitidas: ${info.total}`)
    .text(`Régimen de mercado: ${info.regime}`)
    .text(`Calidad direccional promedio: ${fmt(info.dirAvg, 3)}`)
    .text(`Balance LONG/SHORT: ${info.balanceLong}/${info.balanceShort}`);
  doc.moveDown(0.4);
}

function drawGeneralInfoPage(doc, signals, regime, symbol, dateRange, previousCandles, pacingStats) {
  // Título principal
  doc.fillColor('#1976D2').fontSize(20).text('REPORTE DE SEÑALES DE TRADING v6.6.2', { align: 'center' });
  doc.moveDown(0.5);

  // Información general
  doc.fillColor('#424242').fontSize(14).text('INFORMACIÓN GENERAL', { underline: true });
  doc.moveDown(0.3);
  doc.fillColor('#000').fontSize(11);
  
  const totalSignals = signals.length;
  const longCount = signals.filter(s => s.side === 'LONG').length;
  const shortCount = signals.filter(s => s.side === 'SHORT').length;
  const avgRR = signals.length ? signals.reduce((sum, s) => sum + (s.rr || 0), 0) / signals.length : 0;
  
  doc.text(`Total de señales emitidas: ${totalSignals}`);
  doc.text(`Balance LONG/SHORT: ${longCount}/${shortCount}`);
  doc.text(`Símbolo: ${symbol}`);
  doc.text(`Timeframe: 15 minutos`);
  doc.text(`Regime: ${regime}`);
  doc.text(`Velas previas por predicción: ${previousCandles}`);
  doc.text(`RR promedio: ${fmt(avgRR, 3)}`);
  
  if (dateRange && dateRange.from && dateRange.to) {
    const fromDate = formatLimaDateOnly(dateRange.from);
    const toDate = formatLimaDateOnly(dateRange.to);
    doc.text(`Período de análisis: ${fromDate} - ${toDate}`);
  }
  
  doc.moveDown(0.5);

  // Configuración de pacing
  doc.fillColor('#424242').fontSize(14).text('CONFIGURACIÓN DE PACING', { underline: true });
  doc.moveDown(0.3);
  doc.fillColor('#000').fontSize(11);
  doc.text(`Espaciado mínimo: ${pacingStats?.minSpacingBars || 4} barras (1 hora)`);
  doc.text(`Cooldown por lado: ${pacingStats?.cooldownSideBars || 1} barra (15 minutos)`);
  doc.text(`Máximo por 4h: ${pacingStats?.maxSignals4h || 2} señales`);
  doc.text(`Anti-reversa tras SL: ${pacingStats?.antiReverseBars || 6} barras`);
  doc.moveDown(0.5);

  // Estadísticas de filtrado
  doc.fillColor('#424242').fontSize(14).text('ESTADÍSTICAS DE FILTRADO', { underline: true });
  doc.moveDown(0.3);
  doc.fillColor('#000').fontSize(11);
  doc.text(`Rechazadas por espaciado: ${pacingStats?.removedByMinSpacing || 0}`);
  doc.text(`Rechazadas por cooldown: ${pacingStats?.removedByCooldownSide || 0}`);
  doc.text(`Rechazadas por rate limit: ${pacingStats?.removedByRateLimit4h || 0}`);
  doc.text(`Bloqueadas por anti-reversa: ${pacingStats?.blockedReverseAfterSL || 0}`);
  doc.text(`Total rechazadas: ${pacingStats?.totalPacingRejected || 0}`);
  doc.moveDown(0.5);

  // Resumen de señales
  doc.fillColor('#424242').fontSize(14).text('RESUMEN DE SEÑALES', { underline: true });
  doc.moveDown(0.3);
  doc.fillColor('#000').fontSize(11);
  
  signals.forEach((signal, idx) => {
    const limaTime = formatTzFull(signal.dtISO, 'America/Lima');
    doc.text(`${idx + 1}. ${signal.side} - ${limaTime} - Entrada: $${fmt(signal.entry, 2)} - RR: ${fmt(signal.rr, 2)}`);
  });
}

function drawSignalCard(doc, idx, s, x, y, w, previousCandles = 500) {
  const startX = x;
  const startY = y;
  const pad = 6;
  const innerX = startX + pad;
  const innerY = startY + pad;
  const innerW = w - pad * 2;

  // Header
  doc.save();
  doc.rect(startX, startY, w, 0.001).strokeColor('#e0e0e0').stroke();
  doc.restore();

  doc.save();
  doc.fillColor('#000');
  doc.fontSize(11);
  doc.text(`SEÑAL #${idx + 1} (${previousCandles} prev)`, innerX, innerY, { width: innerW });

  const lima = formatTzFull(s.dtISO, 'America/Lima');
  const mexico = formatTzFull(s.dtISO, 'America/Mexico_City');
  doc.fontSize(8);
  doc.text(`Fecha (Lima): ${lima}`, { width: innerW });
  doc.text(`Fecha (México): ${mexico}`, { width: innerW });
  doc.text(`Tipo: ${s.side === 'LONG' ? 'COMPRA (LONG)' : 'VENTA (SHORT)'}`, { width: innerW });
  doc.text(`Entrada: $${fmt(s.entry, 2)}  SL: $${fmt(s.sl, 2)}  TP1: $${fmt(s.tp1, 2)}${typeof s.tp2 === 'number' ? `  TP2: $${fmt(s.tp2, 2)}` : ''}`, { width: innerW });

  if (s.candle) {
    const c = s.candle;
    doc.moveDown(0.1);
    doc.text(`O: $${fmt(c.open, 2)}  H: $${fmt(c.high, 2)}  L: $${fmt(c.low, 2)}  C: $${fmt(c.close, 2)}  Vol: ${fmt(c.volume, 2)}`, { width: innerW });
  }

  // Información de la próxima vela
  if (s.moveNext) {
    doc.moveDown(0.2);
    doc.fillColor('#2E7D32').fontSize(9).text('📈 PRÓXIMA VELA:', { width: innerW });
    doc.fillColor('#000').fontSize(8);
    const m = s.moveNext;
    doc.text(`Máximo que subió: ${fmt(m.up1Pct, 2)}%`, { width: innerW });
    doc.text(`Máximo que bajó: ${fmt(m.down1Pct, 2)}%`, { width: innerW });
    doc.text(`Wick bajo: $${fmt(m.wickLow, 2)} (${fmt(m.wickLowPct, 2)}%)`, { width: innerW });
    doc.text(`Cierre vs entrada: ${fmt(m.closeDeltaPct, 2)}%`, { width: innerW });
  }

  if (typeof s.slPct === 'number' || typeof s.tp1Pct === 'number' || typeof s.tp2Pct === 'number') {
    doc.moveDown(0.1);
    const parts = [];
    if (typeof s.slPct === 'number') parts.push(`SL: ${fmt(s.slPct, 3)}%`);
    if (typeof s.tp1Pct === 'number') parts.push(`TP1: ${fmt(s.tp1Pct, 3)}%`);
    if (typeof s.tp2Pct === 'number') parts.push(`TP2: ${fmt(s.tp2Pct, 3)}%`);
    doc.text(`Movimientos: ${parts.join('  ')}`, { width: innerW });
  }

  if (s.risk) {
    const r = s.risk;
    doc.moveDown(0.1);
    doc.text(`Riesgo: $${fmt(r.riskUSD ?? 0, 2)}  Esperado: $${fmt(r.gainUSD ?? 0, 2)}  RR: ${fmt(r.rr ?? 0, 2)}:1`, { width: innerW });
  }

  if (s.fees) {
    const f = s.fees;
    doc.moveDown(0.1);
    doc.text(`Pos: $${fmt(f.positionUSD ?? 0, 2)}  Net Taker: $${fmt(f.netTakerUSD ?? 0, 2)}  Net Maker: $${fmt(f.netMakerUSD ?? 0, 2)}  ROI T/M: ${fmt(f.roiTaker ?? 0, 3)}%/${fmt(f.roiMaker ?? 0, 3)}%`, { width: innerW });
  }

  doc.moveDown(0.1);
  const eventScore = s.eventScore !== undefined ? fmt(s.eventScore, 3) : 'N/A';
  const directionScore = s.directionScore !== undefined ? fmt(s.directionScore, 3) : 'N/A';
  const volumeRatio = s.volumeRatio !== undefined ? fmt(s.volumeRatio, 2) : 'N/A';
  doc.text(`Calidad → Evento: ${eventScore}  Dirección: ${directionScore}  VolRatio: ${volumeRatio}x`, { width: innerW });

  const endY = doc.y;

  // Draw card border
  const cardH = endY - innerY + pad;
  doc.save()
    .lineWidth(1)
    .roundedRect(startX, startY, w, Math.max(cardH + pad, 60), 6)
    .strokeColor('#cfd8dc')
    .stroke()
    .restore();

  return startY + Math.max(cardH + pad, 60) + 6; // next y
}

function drawFullSignalPage(doc, signal, idx, previousCandles) {
  // Título de la señal
  doc.fillColor('#1976D2').fontSize(18).text(`SEÑAL #${idx + 1} (${previousCandles} prev)`, { align: 'center' });
  doc.moveDown(0.3);

  // Información básica
  doc.fillColor('#424242').fontSize(14).text('INFORMACIÓN BÁSICA', { underline: true });
  doc.moveDown(0.2);
  doc.fillColor('#000').fontSize(11);
  
  const lima = formatTzFull(signal.dtISO, 'America/Lima');
  const mexico = formatTzFull(signal.dtISO, 'America/Mexico_City');
  
  doc.text(`Fecha (Lima): ${lima}`);
  doc.text(`Fecha (México): ${mexico}`);
  doc.text(`Tipo: ${signal.side === 'LONG' ? 'COMPRA (LONG)' : 'VENTA (SHORT)'}`);
  doc.text(`Entrada: $${fmt(signal.entry, 2)}`);
  doc.text(`Stop Loss: $${fmt(signal.sl, 2)}`);
  doc.text(`Take Profit 1: $${fmt(signal.tp1, 2)}`);
  if (typeof signal.tp2 === 'number') {
    doc.text(`Take Profit 2: $${fmt(signal.tp2, 2)}`);
  }
  doc.text(`Risk/Reward: ${fmt(signal.rr, 3)}`);
  
  doc.moveDown(0.3);

  // Datos de la vela
  if (signal.candle) {
    doc.fillColor('#424242').fontSize(14).text('DATOS DE LA VELA', { underline: true });
    doc.moveDown(0.2);
    doc.fillColor('#000').fontSize(11);
    const c = signal.candle;
    doc.text(`Apertura: $${fmt(c.open, 2)}`);
    doc.text(`Máximo: $${fmt(c.high, 2)}`);
    doc.text(`Mínimo: $${fmt(c.low, 2)}`);
    doc.text(`Cierre: $${fmt(c.close, 2)}`);
    doc.text(`Volumen: ${fmt(c.volume, 2)}`);
    doc.moveDown(0.3);
  }

  // Próxima vela
  if (signal.moveNext) {
    doc.fillColor('#424242').fontSize(14).text('PRÓXIMA VELA', { underline: true });
    doc.moveDown(0.2);
    doc.fillColor('#000').fontSize(11);
    const m = signal.moveNext;
    doc.text(`Máximo que subió: ${fmt(m.up1Pct, 2)}%`);
    doc.text(`Máximo que bajó: ${fmt(m.down1Pct, 2)}%`);
    doc.text(`Wick bajo: $${fmt(m.wickLow, 2)} (${fmt(m.wickLowPct, 2)}%)`);
    doc.text(`Cierre vs entrada: ${fmt(m.closeDeltaPct, 2)}%`);
    doc.moveDown(0.3);
  }

  // Análisis de riesgo
  if (signal.risk) {
    doc.fillColor('#424242').fontSize(14).text('ANÁLISIS DE RIESGO', { underline: true });
    doc.moveDown(0.2);
    doc.fillColor('#000').fontSize(11);
    const r = signal.risk;
    doc.text(`Riesgo USD: $${fmt(r.riskUSD, 2)}`);
    doc.text(`Ganancia USD: $${fmt(r.gainUSD, 2)}`);
    doc.moveDown(0.3);
  }

  // Comisiones y fees
  if (signal.fees) {
    doc.fillColor('#424242').fontSize(14).text('COMISIONES Y FEES', { underline: true });
    doc.moveDown(0.2);
    doc.fillColor('#000').fontSize(11);
    const f = signal.fees;
    doc.text(`ROI Taker: ${fmt(f.roiTaker, 3)}%`);
    doc.text(`ROI Maker: ${fmt(f.roiMaker, 3)}%`);
    doc.moveDown(0.3);
  }

  // Movimientos porcentuales
  if (typeof signal.slPct === 'number' || typeof signal.tp1Pct === 'number' || typeof signal.tp2Pct === 'number') {
    doc.fillColor('#424242').fontSize(14).text('MOVIMIENTOS PORCENTUALES', { underline: true });
    doc.moveDown(0.2);
    doc.fillColor('#000').fontSize(11);
    if (typeof signal.slPct === 'number') doc.text(`SL: ${fmt(signal.slPct, 3)}%`);
    if (typeof signal.tp1Pct === 'number') doc.text(`TP1: ${fmt(signal.tp1Pct, 3)}%`);
    if (typeof signal.tp2Pct === 'number') doc.text(`TP2: ${fmt(signal.tp2Pct, 3)}%`);
  }
}

function generatePdf({ signals, title = 'SEÑALES DE TRADING v6.6', regime = 'low', symbol = 'ETHUSDT', dateRange, previousCandles = 500, pacingStats, outPath = path.join('trades', 'reports', 'signals.pdf') }) {
  ensureDir(path.dirname(outPath));
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  // Página 1: Información general SOLO
  drawGeneralInfoPage(doc, signals, regime, symbol, dateRange, previousCandles, pacingStats);

  // Páginas siguientes: Una señal por página (SIEMPRE nueva página)
  signals.forEach((signal, idx) => {
    doc.addPage(); // SIEMPRE agregar nueva página
    drawFullSignalPage(doc, signal, idx, previousCandles);
  });

  doc.end();
  return new Promise((resolve) => {
    stream.on('finish', () => resolve(outPath));
  });
}

module.exports = { generatePdf };
