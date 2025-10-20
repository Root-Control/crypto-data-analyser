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

function generatePdf({ signals, title = 'SEÑALES DE TRADING v6.6', regime = 'low', symbol = 'ETHUSDT', dateRange, previousCandles = 500, outPath = path.join('trades', 'reports', 'signals.pdf') }) {
  const titleWithRange = dateRange && dateRange.from && dateRange.to
    ? `${title} (${formatLimaDateOnly(dateRange.from)} - ${formatLimaDateOnly(dateRange.to)})`
    : title;

  ensureDir(path.dirname(outPath));
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const dirAvg = signals.length ? signals.reduce((a, s) => a + (s.directionScore || 0), 0) / signals.length : 0;
  const balanceLong = signals.filter(s => s.side === 'LONG').length;
  const balanceShort = signals.filter(s => s.side === 'SHORT').length;

  drawHeader(doc, titleWithRange, { total: signals.length, regime, dirAvg, balanceLong, balanceShort, symbol });

  const gutter = 14;
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = (pageW - gutter) / 2;
  let col = 0; // 0 left, 1 right
  let yPos = doc.y;

  signals.forEach((s, idx) => {
    const x = doc.page.margins.left + (col === 0 ? 0 : colW + gutter);
    const nextY = drawSignalCard(doc, idx, s, x, yPos, colW, previousCandles);

    if (col === 0) {
      // place next in right column at same y
      col = 1;
    } else {
      // move to next row
      col = 0;
      yPos = Math.max(nextY, yPos);
    }

    // If next placement would overflow page, new page
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 40;
    if (yPos + 80 > bottomLimit) {
      doc.addPage();
      yPos = doc.page.margins.top;
      col = 0;
    }
  });

  doc.end();
  return new Promise((resolve) => {
    stream.on('finish', () => resolve(outPath));
  });
}

module.exports = { generatePdf };
