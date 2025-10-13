# API Endpoints - Crypto Data Analyser

## 🎯 Endpoints de Monitoreo

### 1. Estado del Trading Orchestrator

```
GET http://localhost:3010/api/trading/status
```

**Descripción:** Obtiene el estado actual del sistema de trading.

**Respuesta:**

```json
{
  "success": true,
  "activeSetups": 2,
  "currentPrice": 3820.50,
  "config": {
    "symbol": "ETHUSDT",
    "baseCapital": 100,
    "leverage": 10,
    "tp1Split": 0.5,
    "tp2Split": 0.5,
    ...
  }
}
```

---

### 2. Ver Setups Activos

```
GET http://localhost:3010/api/trading/setups/active
```

**Descripción:** Retorna todos los setups activos (IDLE, ARMED, FILLED, TP1_FILLED).

**Respuesta:**

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "setupId": "2025-10-11_19:15_MOMENTUM_BUY_STOP",
      "state": "FILLED",
      "bias": "LONG",
      "entry": 3746.30,
      "sl": 3740.68,
      "tp1": 3753.79,
      "tp2": 3763.16,
      "quantity": 0.267,
      ...
    }
  ]
}
```

---

### 3. Ver Todos los Setups

```
GET http://localhost:3010/api/trading/setups
```

**Query params:**

- `state` - Filtrar por estado (IDLE, ARMED, FILLED, TP1_FILLED, CLOSED, CANCELLED, EXPIRED)
- `blockId` - Filtrar por bloque específico

**Ejemplos:**

```
GET /api/trading/setups?state=CLOSED
GET /api/trading/setups?blockId=2025-10-11_19:15
```

**Respuesta:**

```json
{
  "success": true,
  "count": 10,
  "data": [ ... ]
}
```

---

### 4. Performance y Resultados

```
GET http://localhost:3010/api/trading/performance
```

**Descripción:** Estadísticas de rendimiento de todos los trades cerrados.

**Respuesta:**

```json
{
  "success": true,
  "totalTrades": 45,
  "winners": 28,
  "losers": 17,
  "winRate": "62.22",
  "totalPnL": "234.50",
  "avgWin": "15.30",
  "avgLoss": "-8.20",
  "profitFactor": "1.87"
}
```

---

### 5. Ver Bloques de Análisis

```
GET http://localhost:3010/api/analyser/candles?limit=10
```

**Query params:**

- `pair` - Par de trading (default: ETHUSDT)
- `startDate` - Filtrar por fecha (YYYY-MM-DD)
- `limit` - Cantidad de resultados (default: 10)

**Respuesta:**

```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "pair": "ETHUSDT",
      "startDate": "2025-10-11",
      "startTime": "19:00",
      "status": "completed",
      "analysis": [
        {
          "minute": "19:00",
          "open": 3820.50,
          "close": 3821.20,
          "high": 3821.50,
          "low": 3820.30,
          "fluct": 0.0183,
          "max": 0.0262,
          "min": -0.0052,
          "seq": "HL",
          "tHigh": 12,
          "tLow": 3,
          "prevClose": 3819.80
        },
        ... // 15 velas total
      ]
    }
  ]
}
```

---

### 6. Último Bloque Analizado

```
GET http://localhost:3010/api/analyser/candles/latest
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "pair": "ETHUSDT",
    "startDate": "2025-10-11",
    "startTime": "19:45",
    "status": "in-progress",
    "analysis": [ ... ]
  }
}
```

---

### 7. Stats del Analyser

```
GET http://localhost:3010/api/analyser/stats
```

**Respuesta:**

```json
{
  "success": true,
  "pair": "ETHUSDT",
  "totalBlocks": 125,
  "latestBlock": {
    "startDate": "2025-10-11",
    "startTime": "19:45",
    "minutesAnalyzed": 8
  }
}
```

---

### 8. Predicción Manual (sin activar trading)

```
GET http://localhost:3010/api/analyser/predict?dateTimePrediction=2025-10-11T19:45&showResultantValues=true
```

**Query params:**

- `dateTimePrediction` - Fecha/hora en formato YYYY-MM-DDTHH:MM (UTC)
- `showResultantValues` - true para incluir datos del bloque predicho

**Respuesta:**

```json
{
  "success": true,
  "blocksUsed": 3,
  "prediction": {
    "ok": true,
    "bias": "LONG",
    "levels": {
      "keyLevel": 3740.43,
      "retestBand": [3739.14, 3741.72],
      "volMedian7Pct": 0.058,
      "last15mHigh": 3746.29,
      "last15mLow": 3723.89
    },
    "entries": [
      {
        "type": "MOMENTUM_BUY_STOP",
        "entry": 3746.30,
        "sl": 3740.68,
        "tp1": 3753.79,
        "tp2": 3763.16,
        "tp1TrailRule": "..."
      },
      {
        "type": "RETEST_LIMIT_AFTER_GREEN",
        "entry": 3740.43,
        "sl": 3734.82,
        "tp1": 3747.91,
        "tp2": 3757.26,
        "tp1TrailRule": "..."
      }
    ],
    "invalidation": {
      "cancelIfShortTriggerFirst": 3723.88
    }
  },
  "predictionFor": {
    "startDate": "2025-10-11",
    "startTime": "19:45",
    "dateTime": "2025-10-11T19:45",
    "resultantData": { ... } // Si showResultantValues=true
  }
}
```

---

### 9. Activar Trading Manual

```
POST http://localhost:3010/api/trading/activate?dateTimePrediction=2025-10-11T19:45
```

**Descripción:** Activa manualmente una predicción y sus setups de trading.

**Respuesta:**

```json
{
  "success": true,
  "prediction": { ... },
  "activation": {
    "success": true,
    "setupIds": [
      "2025-10-11_19:45_MOMENTUM_BUY_STOP",
      "2025-10-11_19:45_RETEST_LIMIT_AFTER_GREEN"
    ],
    "blockId": "2025-10-11_19:45"
  },
  "blockWindow": {
    "startDate": "2025-10-11",
    "startTime": "19:45",
    "startTs": 1728676500000,
    "endTs": 1728677400000
  }
}
```

---

## 🔄 Flujo Automático

El sistema funciona **completamente automático** sin necesidad de llamar APIs:

1. **AnalyserService** analiza velas de 1 minuto en tiempo real
2. Al completar 15 minutos → Auto-genera predicción
3. **TradingOrchestrator** recibe evento y activa setups automáticamente
4. Monitorea precio cada segundo y ejecuta trades
5. Guarda resultados en MongoDB

Solo necesitas:

- Correr el servidor: `npm run start:dev`
- Monitorear con: `/api/trading/status` y `/api/trading/setups/active`

---

## 📊 Resumen de URLs Útiles

**Monitoreo en vivo:**

- Estado: `GET /api/trading/status`
- Setups activos: `GET /api/trading/setups/active`
- Performance: `GET /api/trading/performance`

**Consultas:**

- Bloques analizados: `GET /api/analyser/candles?limit=20`
- Stats: `GET /api/analyser/stats`

**Manual (opcional):**

- Ver predicción: `GET /api/analyser/predict?dateTimePrediction=...`
- Activar trading: `POST /api/trading/activate?dateTimePrediction=...`
