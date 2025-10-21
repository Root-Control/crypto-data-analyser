const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function fmt(n, decimals) {
  return Number(n).toFixed(decimals);
}

function calculateATRForSignal(signal, candles) {
  if (!candles || !candles.length) {
    return signal.entry * 0.02; // Fallback: 2% del precio de entrada
  }
  
  // Encontrar el índice de la señal en las velas
  const signalIdx = candles.findIndex(c => c.openTimeISO === signal.dtISO);
  if (signalIdx < 14) {
    return signal.entry * 0.02; // No hay suficientes velas para calcular ATR
  }
  
  // Calcular ATR de 14 períodos
  const atrPeriod = 14;
  const startIdx = Math.max(0, signalIdx - atrPeriod + 1);
  const atrCandles = candles.slice(startIdx, signalIdx + 1);
  
  if (atrCandles.length < 2) {
    return signal.entry * 0.02;
  }
  
  const trs = [];
  for (let i = 1; i < atrCandles.length; i++) {
    const c = atrCandles[i];
    const p = atrCandles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close)
    );
    trs.push(tr);
  }
  
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  return atr;
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
  
  // Constantes de configuración
  doc.moveDown(0.3);
  doc.fillColor('#424242').fontSize(12).text('CONSTANTES DE CONFIGURACIÓN', { underline: true });
  doc.moveDown(0.2);
  doc.fillColor('#000').fontSize(9);
  
  // Parámetros principales
  doc.text('PARÁMETROS PRINCIPALES:');
  doc.text(`• Capital: $400 USD`);
  doc.text(`• Leverage: 10x`);
  doc.text(`• RR mínimo: ${parseFloat(process.env.TP_MULTIPLIER) || 1.30}`);
  doc.text(`• Velas de análisis: ${previousCandles}`);
  doc.moveDown(0.1);
  
  // Fees y costos
  doc.text('FEES Y COSTOS:');
  doc.text(`• Taker fees: 10 bps (0.10%)`);
  doc.text(`• Maker fees: 4 bps (0.04%)`);
  doc.text(`• Slippage: 2 bps (0.02%)`);
  doc.moveDown(0.1);
  
  // Pacing
  doc.text('CONFIGURACIÓN DE PACING:');
  doc.text(`• Espaciado mínimo: 4 velas (1 hora)`);
  doc.text(`• Cooldown por lado: 1 vela (15 min)`);
  doc.text(`• Máximo por 4h: 2 señales`);
  doc.text(`• Anti-reversa tras SL: 6 velas`);
  doc.moveDown(0.1);
  
  // Parámetros de clustering
  doc.text('PARÁMETROS DE CLUSTERING:');
  doc.text(`• Radio precio: max(0.12% * precio, 0.35 * ATR)`);
  doc.text(`• Removidos por tiempo: 12%`);
  doc.text(`• Removidos por precio: 8%`);
  doc.text(`• Reparaciones NaN: 2%`);
  doc.moveDown(0.1);
  
  // Filtros
  doc.text('FILTROS DE RECHAZO:');
  doc.text(`• Por score: 30%`);
  doc.text(`• Por volumen: 20%`);
  doc.text(`• Por dirección: 15%`);
  doc.text(`• Por RR: 10%`);
  doc.text(`• Por calidad: 5%`);
  doc.moveDown(0.1);
  
  // Higiene
  doc.text('PARÁMETROS DE HIGIENE:');
  doc.text(`• Tolerancia a fallos: 15%`);
  doc.text(`• Fallback de volumen: 25%`);
  doc.text(`• Override de espacio: 10%`);
  doc.text(`• ATR target OK: 70%`);
  
            if (dateRange && dateRange.from && dateRange.to) {
              doc.moveDown(0.2);
              const fromDate = new Date(dateRange.from);
              const toDate = new Date(dateRange.to);
              const fromFormatted = fromDate.toLocaleString('es-PE', { 
                timeZone: 'America/Lima',
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              });
              const toFormatted = toDate.toLocaleString('es-PE', { 
                timeZone: 'America/Lima',
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              });
              doc.text(`Período de análisis: ${fromFormatted} - ${toFormatted} (Lima)`);
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
              
              // Wick de retroceso: mecha superior para LONG, mecha inferior para SHORT
              if (s.side === 'LONG') {
                doc.text(`Wick de retroceso: $${fmt(m.wickHigh, 2)} (${fmt(m.wickHighPct, 2)}%)`, { width: innerW });
              } else {
                doc.text(`Wick de retroceso: $${fmt(m.wickLow, 2)} (${fmt(m.wickLowPct, 2)}%)`, { width: innerW });
              }
              
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

function drawFullSignalPage(doc, signal, idx, previousCandles, candles = []) {
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
  
  // Calcular volatilidad (ATR) para esta señal
  if (signal.candle) {
    // Calcular ATR de 14 períodos usando la vela actual y las 13 anteriores
    const atr = calculateATRForSignal(signal, candles);
    if (atr && atr > 0) {
      const atrPct = (atr / signal.entry * 100);
      doc.text(`Volatilidad (ATR): ${fmt(atr, 2)} (${fmt(atrPct, 2)}%)`);
    }
  }
  
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
    
    // Wick de retroceso de la vela señal
    if (signal.side === 'LONG') {
      const wickHigh = Math.max(0, c.high - signal.entry);
      const wickHighPct = (wickHigh / signal.entry) * 100;
      doc.text(`Wick de retroceso: $${fmt(wickHigh, 2)} (${fmt(wickHighPct, 2)}%)`);
    } else {
      const wickLow = Math.max(0, signal.entry - c.low);
      const wickLowPct = (wickLow / signal.entry) * 100;
      doc.text(`Wick de retroceso: $${fmt(wickLow, 2)} (${fmt(wickLowPct, 2)}%)`);
    }
    
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
    doc.text(`Cierre vs entrada: ${fmt(m.closeDeltaPct, 2)}%`);
    doc.moveDown(0.3);
  }

  // Análisis de comportamiento real
  if (signal.realBehavior) {
    doc.fillColor('#424242').fontSize(14).text('ANÁLISIS DE COMPORTAMIENTO REAL', { underline: true });
    doc.moveDown(0.2);
    doc.fillColor('#000').fontSize(11);
    
    const behavior = signal.realBehavior;
    doc.text(`Resultado: ${behavior.exitReason}`);
    
    if (behavior.candleNumber) {
      doc.text(`Vela de salida: ${behavior.candleNumber}`);
    }
    
    if (behavior.exitPrice) {
      doc.text(`Precio de salida: $${fmt(behavior.exitPrice, 2)}`);
    }
    
    doc.text(`Velas analizadas: ${behavior.candlesAnalyzed}`);
    doc.moveDown(0.1);
    
    // Información de min/max y cuál llegó primero
    doc.fillColor('#666').fontSize(10).text('RANGO DE PRECIOS EN 10 VELAS:', { underline: true });
    doc.fillColor('#000').fontSize(10);
    doc.text(`Mínimo: $${fmt(behavior.minPrice, 2)} (vela ${behavior.minCandle})`);
    doc.text(`Máximo: $${fmt(behavior.maxPrice, 2)} (vela ${behavior.maxCandle})`);
    
    if (behavior.firstReached) {
      doc.text(`Primero en alcanzar: ${behavior.firstReached}`);
    } else {
      doc.text(`Primero en alcanzar: Ninguno`);
    }
    
    // Información adicional cuando no se llega a ninguno
    if (behavior.exitReason === 'No se llegó a ninguno') {
      doc.moveDown(0.1);
      doc.fillColor('#666').fontSize(10).text('CIERRE FINAL (10 VELAS):', { underline: true });
      doc.fillColor('#000').fontSize(10);
      doc.text(`Precio de cierre: $${fmt(behavior.exitPrice, 2)}`);
      
      if (behavior.finalClosePct !== undefined) {
        const pct = behavior.finalClosePct;
        const result = behavior.finalCloseResult;
        const color = pct > 0 ? '#2E7D32' : '#D32F2F';
        const symbol = pct > 0 ? '+' : '';
        
        doc.fillColor(color).text(`${result}: ${symbol}${fmt(pct, 2)}%`);
        doc.fillColor('#000');
      }
    }
    
    doc.moveDown(0.1);
    
    // Información adicional sobre el análisis
    if (behavior.reached === 'TP') {
      doc.fillColor('#2E7D32').text('✅ Take Profit alcanzado');
    } else if (behavior.reached === 'SL') {
      doc.fillColor('#D32F2F').text('❌ Stop Loss alcanzado');
    } else {
      doc.fillColor('#FF9800').text('⏳ Sin salida en 10 velas');
    }
    
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

function generatePdf({ signals, title = 'SEÑALES DE TRADING v6.6', regime = 'low', symbol = 'ETHUSDT', dateRange, previousCandles = 500, pacingStats, candles = [], outPath = path.join('trades', 'reports', 'signals.pdf') }) {
  ensureDir(path.dirname(outPath));
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  // Página 1: Información general SOLO
  drawGeneralInfoPage(doc, signals, regime, symbol, dateRange, previousCandles, pacingStats);

  // Páginas siguientes: Una señal por página (SIEMPRE nueva página)
  signals.forEach((signal, idx) => {
    doc.addPage(); // SIEMPRE agregar nueva página
    drawFullSignalPage(doc, signal, idx, previousCandles, candles);
  });

  // Página final: Resumen de PnL
  doc.addPage();
  drawPnLSummaryPage(doc, signals);
  
  // Página adicional: Tabla detallada de señales
  doc.addPage();
  drawPnLTablePage(doc, signals);

  doc.end();
  return new Promise((resolve) => {
    stream.on('finish', () => resolve(outPath));
  });
}

function drawPnLSummaryPage(doc, signals) {
  // Título de la página
  doc.fillColor('#1976D2').fontSize(20).text('RESUMEN DE PnL REAL', { align: 'center' });
  doc.moveDown(0.5);

  // Calcular métricas de PnL
  let totalGrossPct = 0;
  let totalNetPct = 0;
  let totalNetUsd = 0;
  let totalCostUsd = 0;
  let wins = 0;
  let losses = 0;
  let tpCount = 0;
  let slCount = 0;
  let expCount = 0;

  signals.forEach(signal => {
    if (signal.realPnL) {
      const pnl = signal.realPnL;
      totalGrossPct += pnl.grossPct;
      totalNetPct += pnl.netPct;
      totalNetUsd += pnl.netUsd;
      totalCostUsd += pnl.costPct * pnl.capital;
      
      if (pnl.netPct > 0) wins++;
      else if (pnl.netPct < 0) losses++;
      
      if (pnl.exitReason === 'TP') tpCount++;
      else if (pnl.exitReason === 'SL') slCount++;
      else if (pnl.exitReason === 'EXP') expCount++;
    }
  });

  const capitalInicial = 400 * signals.length;
  const capitalFinal = capitalInicial + totalNetUsd;
  const gananciaPerdida = totalNetUsd;

  // Resumen general
  doc.fillColor('#424242').fontSize(16).text('RESUMEN GENERAL', { underline: true });
  doc.moveDown(0.3);
  doc.fillColor('#000').fontSize(12);
  
  doc.text(`Total de señales: ${signals.length}`);
  doc.text(`Capital inicial: $${capitalInicial.toFixed(2)}`);
  doc.text(`Capital final: $${capitalFinal.toFixed(2)}`);
  doc.text(`Ganancia/Pérdida total: $${gananciaPerdida.toFixed(2)}`);
  doc.moveDown(0.2);

  // Métricas de performance
  doc.fillColor('#424242').fontSize(14).text('MÉTRICAS DE PERFORMANCE', { underline: true });
  doc.moveDown(0.2);
  doc.fillColor('#000').fontSize(11);
  
  doc.text(`Ganancias: ${wins} (${((wins/signals.length)*100).toFixed(1)}%)`);
  doc.text(`Pérdidas: ${losses} (${((losses/signals.length)*100).toFixed(1)}%)`);
  doc.text(`ROI Promedio: ${(totalNetPct/signals.length).toFixed(2)}%`);
  doc.text(`PnL Bruto Total: ${totalGrossPct.toFixed(2)}%`);
  doc.text(`Costos Total: $${totalCostUsd.toFixed(2)} USD`);
  doc.text(`PnL Neto Total: ${totalNetPct.toFixed(2)}% ($${totalNetUsd.toFixed(2)})`);
  doc.moveDown(0.2);

  // Distribución de salidas
  doc.fillColor('#424242').fontSize(14).text('DISTRIBUCIÓN DE SALIDAS', { underline: true });
  doc.moveDown(0.2);
  doc.fillColor('#000').fontSize(11);
  
  doc.text(`Take Profit alcanzados: ${tpCount} (${((tpCount/signals.length)*100).toFixed(1)}%)`);
  doc.text(`Stop Loss alcanzados: ${slCount} (${((slCount/signals.length)*100).toFixed(1)}%)`);
  doc.text(`Sin salida (EXP): ${expCount} (${((expCount/signals.length)*100).toFixed(1)}%)`);
  doc.moveDown(0.3);


  // Resumen final
  doc.moveDown(0.5);
  doc.fillColor('#1976D2').fontSize(12).text('RESUMEN FINAL', { align: 'center' });
  doc.moveDown(0.2);
  doc.fillColor('#000').fontSize(11);
  
  const winRate = ((wins / signals.length) * 100).toFixed(1);
  const avgROI = (totalNetPct / signals.length).toFixed(2);
  
  doc.text(`Tasa de ganancia: ${winRate}%`, { align: 'center' });
  doc.text(`ROI promedio por señal: ${avgROI}%`, { align: 'center' });
  doc.text(`Ganancia total: $${gananciaPerdida.toFixed(2)}`, { align: 'center' });
  
  if (gananciaPerdida > 0) {
    doc.fillColor('#2E7D32').text('✅ ESTRATEGIA RENTABLE', { align: 'center' });
  } else {
    doc.fillColor('#D32F2F').text('❌ ESTRATEGIA PERDEDORA', { align: 'center' });
  }
}

function drawPnLTablePage(doc, signals) {
  // Título de la página
  doc.fillColor('#1976D2').fontSize(20).text('TABLA DETALLADA DE SEÑALES', { align: 'center' });
  doc.fillColor('#666').fontSize(12).text('Cálculos usando $400 apalancado a 20X', { align: 'center' });
  doc.moveDown(0.5);

  // Definir posiciones de columnas
  const colPositions = {
    signal: 30,
    type: 60,
    entry: 110,
    exit: 160,
    reason: 210,
    grossROI: 260,
    grossUsd: 320,
    netROI: 380,
    netUsd: 440,
    fees: 500
  };

  // Encabezados de tabla con fondo gris
  const headerY = doc.y;
  doc.rect(40, headerY - 5, 500, 25).fill('#f5f5f5');
  
  doc.fillColor('#333').fontSize(9).font('Helvetica-Bold');
  doc.text('Señal', colPositions.signal, headerY);
  doc.text('Tipo', colPositions.type, headerY);
  doc.text('Entrada', colPositions.entry, headerY);
  doc.text('Salida', colPositions.exit, headerY);
  doc.text('Razón', colPositions.reason, headerY);
  doc.text('Bruto ROI%', colPositions.grossROI, headerY);
  doc.text('Bruto $', colPositions.grossUsd, headerY);
  doc.text('Neto ROI%', colPositions.netROI, headerY);
  doc.text('Neto $', colPositions.netUsd, headerY);
  doc.text('Fees $', colPositions.fees, headerY);
  
  doc.moveDown(0.4);
  
  // Línea separadora
  doc.strokeColor('#ccc').lineWidth(1).moveTo(40, doc.y).lineTo(540, doc.y).stroke();
  doc.moveDown(0.2);
  
  // Datos de señales
  doc.fillColor('#000').fontSize(8).font('Helvetica');
  signals.forEach((signal, idx) => {
    if (signal.realPnL) {
      const pnl = signal.realPnL;
      const grossColor = pnl.grossROI > 0 ? '#2E7D32' : pnl.grossROI < 0 ? '#D32F2F' : '#000';
      const netColor = pnl.netPct > 0 ? '#2E7D32' : pnl.netPct < 0 ? '#D32F2F' : '#000';
      const rowY = doc.y;
      
      // Fondo alternado para filas
      if (idx % 2 === 0) {
        doc.rect(30, rowY - 3, 520, 18).fill('#fafafa');
      }
      
      doc.fillColor('#000').text(`${idx + 1}`, colPositions.signal, rowY);
      doc.fillColor('#000').text(signal.side, colPositions.type, rowY);
      doc.fillColor('#000').text(`$${signal.entry.toFixed(0)}`, colPositions.entry, rowY);
      doc.fillColor('#000').text(`$${pnl.exitPrice.toFixed(0)}`, colPositions.exit, rowY);
      doc.fillColor('#000').text(pnl.exitReason, colPositions.reason, rowY);
                  doc.fillColor(grossColor).text(`${pnl.grossROI.toFixed(2)}%`, colPositions.grossROI, rowY);
                  doc.fillColor(grossColor).text(`$${pnl.grossUsd.toFixed(2)}`, colPositions.grossUsd, rowY);
                  doc.fillColor(netColor).text(`${pnl.netPct.toFixed(2)}%`, colPositions.netROI, rowY);
                  doc.fillColor(netColor).text(`$${pnl.netUsd.toFixed(2)}`, colPositions.netUsd, rowY);
                  doc.fillColor('#666').text(`$${pnl.totalFees.toFixed(2)}`, colPositions.fees, rowY);
      
      doc.moveDown(0.3);
      
      // Línea separadora sutil
      if (idx < signals.length - 1) {
        doc.strokeColor('#e0e0e0').lineWidth(0.5).moveTo(30, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.1);
      }
    }
  });

  // Fila de totales
  doc.moveDown(0.4);
  
  // Línea separadora gruesa
  doc.strokeColor('#1976D2').lineWidth(2).moveTo(30, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.3);
  
  // Calcular totales
  let totalGrossUsd = 0;
  let totalNetUsd = 0;
  let totalFees = 0;
  let wins = 0;
  let losses = 0;
  
  signals.forEach(signal => {
    if (signal.realPnL) {
      const pnl = signal.realPnL;
      totalGrossUsd += pnl.grossUsd;
      totalNetUsd += pnl.netUsd;
      totalFees += pnl.totalFees;
      if (pnl.netPct > 0) wins++;
      else if (pnl.netPct < 0) losses++;
    }
  });
  
  const totalROI = (totalNetUsd / (400 * signals.length)) * 100;
  const winRate = ((wins / signals.length) * 100).toFixed(1);
  
  // Fondo para totales con borde
  const totalY = doc.y;
  doc.rect(30, totalY - 5, 520, 25).fill('#f8f9fa');
  doc.rect(30, totalY - 5, 520, 25).stroke('#1976D2').lineWidth(1);
  
  // Texto de totales con mejor formato
  doc.fillColor('#1976D2').fontSize(10).font('Helvetica-Bold');
  doc.text('TOTALES', colPositions.signal, totalY + 2);
  doc.text(`${wins}W/${losses}L`, colPositions.type, totalY + 2);
  doc.text(`(${winRate}%)`, colPositions.entry, totalY + 2);
  doc.text('', colPositions.exit, totalY + 2); // Salida vacía
  doc.text('', colPositions.reason, totalY + 2); // Razón vacía
  
  // Colores para ROI y USD
  const roiColor = totalROI > 0 ? '#2E7D32' : totalROI < 0 ? '#D32F2F' : '#000';
  const usdColor = totalNetUsd > 0 ? '#2E7D32' : totalNetUsd < 0 ? '#D32F2F' : '#000';
  
  doc.fillColor(roiColor).text(`${totalROI.toFixed(2)}%`, colPositions.grossROI, totalY + 2);
  doc.fillColor(usdColor).text(`$${totalGrossUsd.toFixed(2)}`, colPositions.grossUsd, totalY + 2);
  doc.fillColor(roiColor).text(`${totalROI.toFixed(2)}%`, colPositions.netROI, totalY + 2);
  doc.fillColor(usdColor).text(`$${totalNetUsd.toFixed(2)}`, colPositions.netUsd, totalY + 2);
  doc.fillColor('#666').text(`$${totalFees.toFixed(2)}`, colPositions.fees, totalY + 2);
  
  // Resumen adicional más abajo
  doc.moveDown(0.6);
  doc.fillColor('#666').fontSize(8).font('Helvetica');
  doc.text(`Capital total: $${(400 * signals.length).toFixed(0)}`, { align: 'center' });
  doc.moveDown(0.1);
  doc.text(`ROI promedio: ${(totalROI / signals.length).toFixed(1)}%`, { align: 'center' });
  doc.moveDown(0.1);
  doc.text(`Fees totales: $${totalFees.toFixed(0)}`, { align: 'center' });

}

module.exports = { generatePdf };
