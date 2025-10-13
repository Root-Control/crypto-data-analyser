# 🔍 Ejemplos de Uso - Motor v8.1 Integrado

## 🚀 Inicio del Sistema

```bash
npm run dev
```

---

## 📊 Logs Esperados (Tiempo Real)

### Ejemplo 1: Minuto Alcista con Imbalance Compradora

```
🟢 Oct 12 14:23 | Open: $2450.50 → Close: $2457.80 | Fluct: +0.2979% | Max: +0.3520% | Min: -0.0612% | Seq: HL | Vol: 245 | Imb: +0.3214 | VWAP: $2455.12 | Ticks: 618 | BULL
```

**Interpretación**:

- 🟢 **Alcista**: Precio subió (+0.2979%)
- **Seq: HL**: High primero, Low después (patrón alcista)
- **Vol: 245**: 245 ETH negociados
- **Imb: +0.3214**: 32% más presión compradora que vendedora
- **VWAP: $2455.12**: Precio justo ponderado por volumen
- **Ticks: 618**: 618 trades procesados
- **BULL**: Flag de confianza alcista (imbalance > 0.2 && close > VWAP)

---

### Ejemplo 2: Minuto Bajista con Imbalance Vendedora

```
🔴 Oct 12 14:24 | Open: $2457.80 → Close: $2448.20 | Fluct: -0.3904% | Max: +0.0815% | Min: -0.4520% | Seq: LH | Vol: 312 | Imb: -0.2891 | VWAP: $2451.50 | Ticks: 823 | BEAR
```

**Interpretación**:

- 🔴 **Bajista**: Precio bajó (-0.3904%)
- **Seq: LH**: Low primero, High después (patrón bajista)
- **Imb: -0.2891**: 29% más presión vendedora
- **BEAR**: Flag de confianza bajista

---

### Ejemplo 3: Minuto con Climax (Volumen Extremo)

```
⏰ 🟢 Oct 12 14:30 | Open: $2448.20 → Close: $2465.50 | Fluct: +0.7069% | Max: +0.8210% | Min: -0.1205% | Seq: HL | Vol: 1523 | Imb: +0.5402 | VWAP: $2458.35 | Ticks: 3204 | BULL+CLIMAX
```

**Interpretación**:

- ⏰ **Marca de 15 minutos**: Inicio de nuevo ciclo
- **Vol: 1523**: Volumen **6x mayor** que promedio (245)
- **Imb: +0.5402**: Presión compradora **extrema**
- **Ticks: 3204**: **5x más trades** que promedio
- **CLIMAX**: Flag activado (volumen > p80 del rolling window)
- **Acción recomendada**: Posible reversión, evitar entrar en LONG

---

## 🗄️ MongoDB: Estructura de Datos

### Consulta Básica

```javascript
db.candleanalysers.findOne({
  pair: 'ETHUSDT',
  startDate: '2025-10-12',
  startTime: '14:30',
});
```

### Resultado (Ejemplo)

```json
{
  "_id": "671a2b3c4d5e6f7890123456",
  "pair": "ETHUSDT",
  "startDate": "2025-10-12",
  "startTime": "14:30",
  "status": "completed",
  "analysis": [
    {
      // ===== LEGACY FIELDS =====
      "minute": "14:30",
      "open": 2448.2,
      "close": 2465.5,
      "high": 2468.3,
      "low": 2445.25,
      "fluct": 0.7069,
      "max": 0.821,
      "min": -0.1205,
      "seq": "HL",
      "tHigh": 23,
      "tLow": 47,
      "prevClose": 2448.2,

      // ===== NEW v8.1 FIELDS =====
      "tickVol": 1523.45,
      "buyVol": 934.21,
      "sellVol": 589.24,
      "delta": 344.97,
      "imbalance": 0.5402,
      "vwap": 2458.35,
      "tickCount": 3204,
      "invalidTickCount": 0,
      "outOfWindowTickCount": 0,
      "firstMove": "up",
      "flags": {
        "bullish": true,
        "bearish": false,
        "climax": true,
        "meanRevertBias": "down"
      }
    }
    // ... 14 minutos más
  ],
  "createdAt": "2025-10-12T14:30:00.123Z",
  "updatedAt": "2025-10-12T14:45:02.456Z"
}
```

---

## 🔍 Verificación de Integración

### 1. Verificar que campos nuevos existen en MongoDB

```javascript
// Conectar a MongoDB
mongosh

// Usar la base de datos
use your_database

// Buscar último documento
const lastDoc = db.candleanalysers.findOne(
  {},
  { sort: { createdAt: -1 } }
);

// Verificar primer minuto del array
const firstMinute = lastDoc.analysis[0];

// ✅ Verificar campos nuevos
console.log("tickVol:", firstMinute.tickVol);          // ✅ Debe existir
console.log("buyVol:", firstMinute.buyVol);            // ✅ Debe existir
console.log("sellVol:", firstMinute.sellVol);          // ✅ Debe existir
console.log("delta:", firstMinute.delta);              // ✅ Debe existir
console.log("imbalance:", firstMinute.imbalance);      // ✅ Debe existir
console.log("vwap:", firstMinute.vwap);                // ✅ Debe existir
console.log("tickCount:", firstMinute.tickCount);      // ✅ Debe existir
console.log("firstMove:", firstMinute.firstMove);      // ✅ Debe existir (up/down/null)
console.log("flags:", firstMinute.flags);              // ✅ Debe existir como objeto

// ✅ Verificar flags
console.log("flags.bullish:", firstMinute.flags.bullish);    // ✅ boolean
console.log("flags.bearish:", firstMinute.flags.bearish);    // ✅ boolean
console.log("flags.climax:", firstMinute.flags.climax);      // ✅ boolean
console.log("flags.meanRevertBias:", firstMinute.flags.meanRevertBias); // ✅ 'up'/'down'/null

// ✅ Verificar backward compatibility (legacy names)
console.log("max:", firstMinute.max);                  // ✅ Debe existir (legacy)
console.log("min:", firstMinute.min);                  // ✅ Debe existir (legacy)
console.log("seq:", firstMinute.seq);                  // ✅ HL/LH/H-/-L
```

---

### 2. Verificar Logs en Tiempo Real

```bash
# Iniciar servidor
npm run dev

# Esperar 1-2 minutos

# Buscar en logs:
# ✅ "Vol: XXX"        → Volumen total
# ✅ "Imb: +X.XXXX"    → Imbalance
# ✅ "VWAP: $XXXX.XX"  → VWAP
# ✅ "Ticks: XXX"      → Tick count
# ✅ "BULL" o "BEAR"   → Flags de confianza
# ✅ "CLIMAX"          → Si volumen es extremo
```

---

### 3. Test de Integración (curl)

```bash
# Esperar a que se complete un bloque de 15 minutos

# Luego consultar API
curl -s "http://localhost:3010/api/analyser/candles?limit=1" | jq

# Verificar estructura de response:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "pair": "ETHUSDT",
      "startDate": "2025-10-12",
      "startTime": "14:30",
      "status": "completed",
      "analysis": [
        {
          "minute": "14:30",
          // ... campos legacy
          "tickVol": 1523.45,      // ✅ NEW
          "buyVol": 934.21,        // ✅ NEW
          "sellVol": 589.24,       // ✅ NEW
          "delta": 344.97,         // ✅ NEW
          "imbalance": 0.5402,     // ✅ NEW
          "vwap": 2458.35,         // ✅ NEW
          "tickCount": 3204,       // ✅ NEW
          "firstMove": "up",       // ✅ NEW
          "flags": {               // ✅ NEW
            "bullish": true,
            "bearish": false,
            "climax": true,
            "meanRevertBias": "down"
          }
        }
        // ... 14 minutos más
      ]
    }
  ]
}
```

---

## 🎯 Uso en Predicciones

### Antes (sin motor):

```typescript
// predictFromBlocks.ts (lógica simplificada)
function analyzeCandleQuality(candle) {
  // Solo teníamos: open, close, fluct, seq
  // No sabíamos si había presión compradora/vendedora
  // No teníamos VWAP para confirmar precio justo
  return { quality: 'unknown' };
}
```

### Ahora (con motor v8.1):

```typescript
// predictFromBlocks.ts (lógica mejorada)
function analyzeCandleQuality(candle) {
  // ✅ Tenemos 25 métricas

  // 1. Verificar calidad de datos
  if (candle.invalidTickCount > 5) {
    return { quality: 'poor', confidence: 0.2 };
  }

  // 2. Verificar flags de confianza
  if (candle.flags.climax) {
    // Volumen extremo → posible reversión
    return {
      quality: 'reversal-candidate',
      confidence: 0.9,
      action: 'WAIT', // No entrar
    };
  }

  // 3. Confirmar dirección con imbalance
  if (candle.fluct > 0 && candle.imbalance > 0.3) {
    // Subió + presión compradora fuerte
    return {
      quality: 'strong-bullish',
      confidence: 0.85,
      action: 'LONG',
    };
  }

  // 4. Confirmar con VWAP
  if (candle.close > candle.vwap && candle.flags.bullish) {
    // Cerró arriba de VWAP + flag bullish
    return {
      quality: 'confirmed-bullish',
      confidence: 0.8,
      action: 'LONG',
    };
  }

  // 5. Desconfiar si hay contradicción
  if (candle.fluct > 0 && candle.imbalance < -0.2) {
    // Subió pero con presión vendedora → débil
    return {
      quality: 'weak-bullish',
      confidence: 0.4,
      action: 'WAIT',
    };
  }

  return { quality: 'neutral', confidence: 0.5 };
}
```

---

## 🐛 Debugging

### Si no ves campos nuevos en logs:

1. **Verificar que el servicio se reinició**:

```bash
# Detener servidor
Ctrl+C

# Limpiar build
rm -rf dist/

# Re-compilar
npm run build

# Iniciar de nuevo
npm run dev
```

2. **Verificar imports en analyser.service.ts**:

```typescript
// Debe incluir:
import {
  closeMinute,
  updateRollingStats,
  addClimaxFlag,
} from '../../helpers/marketMinute';
import { serializeMinute } from '../../helpers/serializeMinute';
```

3. **Verificar que se llama al motor**:

```typescript
// En closeMinute(), debe haber:
let metrics: MinuteMetrics = closeMinute(st, DEFAULT_PARAMS);
this.rollingStats = updateRollingStats(this.rollingStats, metrics);
metrics = addClimaxFlag(metrics, this.rollingStats, DEFAULT_PARAMS);
```

---

### Si MongoDB no tiene campos nuevos:

1. **Limpiar colección y re-iniciar**:

```javascript
// Conectar a MongoDB
mongosh;

// Borrar documentos viejos
db.candleanalysers.deleteMany({ createdAt: { $lt: new Date() } });

// Reiniciar servidor
// npm run dev

// Esperar 15 minutos y verificar de nuevo
```

2. **Verificar schema de Mongoose**:

```bash
# Debe incluir en MinuteAnalysis:
grep -A 5 "tickVol" src/modules/analyser/schemas/candle-analyser.schema.ts
grep -A 10 "flags" src/modules/analyser/schemas/candle-analyser.schema.ts
```

---

## ✅ Checklist de Verificación Completa

- [ ] **Build exitoso**: `npm run build` sin errores
- [ ] **Servidor inicia**: `npm run dev` sin crashes
- [ ] **Logs muestran Vol**: Ver `| Vol: XXX` en logs
- [ ] **Logs muestran Imb**: Ver `| Imb: +X.XXXX` en logs
- [ ] **Logs muestran VWAP**: Ver `| VWAP: $XXXX.XX` en logs
- [ ] **Logs muestran Ticks**: Ver `| Ticks: XXX` en logs
- [ ] **Logs muestran Flags**: Ver `| BULL` o `| BEAR` en logs
- [ ] **MongoDB tiene tickVol**: `db.candleanalysers.findOne().analysis[0].tickVol` existe
- [ ] **MongoDB tiene flags**: `db.candleanalysers.findOne().analysis[0].flags` es objeto
- [ ] **API retorna campos nuevos**: `/api/analyser/candles` incluye `tickVol`, `flags`, etc.
- [ ] **Sin linter errors**: `npm run lint` clean
- [ ] **Sin crashes por 1 hora**: Servidor estable

---

## 🎉 Success Criteria

Si todos estos puntos están ✅:

1. **Logs en tiempo real** muestran: Vol, Imb, VWAP, Ticks, Flags
2. **MongoDB** tiene 25 campos en `analysis[]`
3. **API** retorna campos nuevos
4. **No hay crashes** durante 1 hora de operación
5. **Build y linter** están clean

**¡ENTONCES LA INTEGRACIÓN ES EXITOSA!** 🚀💎🤖

---

**El motor v8.1 está procesando el mercado en tiempo real con análisis de nivel institucional** 💰

