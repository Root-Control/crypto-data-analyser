# Trading Orchestrator - Sistema de Trading Automático

## 🎯 Descripción

Sistema automatizado que ejecuta predicciones de trading basadas en análisis de velas de 15 minutos, con gestión completa de entradas, stops y take profits.

## 📋 Endpoints

### 1. Activar Predicción

```
POST /api/trading/activate?dateTimePrediction=2025-10-11T19:45
```

**Descripción:** Activa una predicción automática para el bloque especificado.

**Proceso:**

1. Busca los 3 bloques anteriores de 15 minutos
2. Genera predicción usando `predictFromBlocks`
3. Activa setups de trading (Momentum + Retest)
4. Inicia monitoreo en tiempo real

**Respuesta:**

```json
{
  "success": true,
  "prediction": {
    "bias": "LONG",
    "levels": { ... },
    "entries": [ ... ]
  },
  "activation": {
    "setupIds": ["2025-10-11_19:45_MOMENTUM_BUY_STOP", "..."]
  },
  "blockWindow": {
    "startDate": "2025-10-11",
    "startTime": "19:45",
    "startTs": 1728676500000,
    "endTs": 1728677400000
  }
}
```

### 2. Estado del Orquestador

```
GET /api/trading/status
```

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
    ...
  }
}
```

### 3. Listar Setups

```
GET /api/trading/setups?state=FILLED&blockId=2025-10-11_19:45
```

**Query params:**

- `state`: IDLE, ARMED, FILLED, TP1_FILLED, CLOSED, CANCELLED, EXPIRED
- `blockId`: ID del bloque (opcional)

### 4. Setups Activos

```
GET /api/trading/setups/active
```

Retorna todos los setups en estados activos (IDLE, ARMED, FILLED, TP1_FILLED).

### 5. Performance

```
GET /api/trading/performance
```

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

## 🔄 Máquina de Estados

```
IDLE → ARMED → FILLED → TP1_FILLED → CLOSED
  ↓       ↓        ↓          ↓
  → CANCELLED ←────┴──────────┴
  → EXPIRED ←──────┴──────────┘
```

### Estados:

- **IDLE**: Esperando condiciones de entrada
- **ARMED**: Orden de entrada colocada
- **FILLED**: Posición abierta, SL/TP activos
- **TP1_FILLED**: TP1 ejecutado, SL movido a breakeven
- **CLOSED**: Cerrado por TP2, SL o Trailing SL
- **CANCELLED**: Cancelado por invalidación
- **EXPIRED**: Venció ventana temporal sin activarse

## 🎮 Estrategias por Sesgo

### LONG (2 setups):

#### 1. MOMENTUM_BUY_STOP

- **Condición**: Precio >= entry (rompe last15mHigh)
- **Entrada**: Stop Market
- **Gestión**: Al TP1, mover SL a entry - 0.02%

#### 2. RETEST_LIMIT_AFTER_GREEN

- **Condición**: Toca banda de retest + siguiente vela cierra verde
- **Entrada**: Limit Order
- **Gestión**: Al TP1, mover SL a entry - 0.02%

### SHORT (2 setups):

#### 1. MOMENTUM_SELL_STOP

- **Condición**: Precio <= entry (rompe last15mLow)
- **Entrada**: Stop Market
- **Gestión**: Al TP1, mover SL a entry + 0.02%

#### 2. RETEST_LIMIT_AFTER_RED

- **Condición**: Toca banda de retest + siguiente vela cierra roja
- **Entrada**: Limit Order
- **Gestión**: Al TP1, mover SL a entry + 0.02%

## 🛡️ Sistema de Invalidación

**LONG**: Se cancela si el precio toca `cancelIfShortTriggerFirst` (antes del fill)

**SHORT**: Se cancela si el precio toca `cancelIfLongTriggerFirst` (antes del fill)

## 📊 Configuración

```typescript
{
  symbol: 'ETHUSDT',
  baseCapital: 100,        // USD
  leverage: 10,
  tp1Split: 0.5,           // 50% en TP1
  tp2Split: 0.5,           // 50% en TP2
  spreadMax: 0.0005,       // 0.05% máx
  slippageMax: 0.0003,     // 0.03% máx
  volMax: 0.5,             // 0.5% volatilidad máx
  rrMin: 1.5,              // Risk/Reward mínimo
  throttleMinutes: 5,
  strictRetest: true,
  allowPyramiding: false,
  tickSize: 0.01,
  stepSize: 0.001
}
```

## 🎯 WebSockets Conectados

1. **Mark Price @ 1s**: Precio de referencia para stops
2. **Kline 1m**: Detección de velas verdes/rojas para retest
3. **BookTicker**: Spread en tiempo real

## 📡 Eventos Emitidos

- `setup.created`: Setup creado
- `setup.armed`: Orden de entrada colocada
- `setup.filled`: Posición abierta
- `setup.tp1_filled`: TP1 ejecutado, SL movido
- `setup.closed`: Setup cerrado (con PNL y razón)
- `setup.cancelled`: Setup cancelado
- `setup.expired`: Setup expirado

## 💰 Cálculo de PNL

```typescript
PNL Total = PNL_TP1 + PNL_remanente

LONG:
  PNL = (exitPrice - entryPrice) * quantity

SHORT:
  PNL = (entryPrice - exitPrice) * quantity
```

## 📈 Métricas

- **MAE** (Maximum Adverse Excursion): Peor drawdown durante la operación
- **MFE** (Maximum Favorable Excursion): Mejor profit durante la operación
- **Win Rate**: % de trades ganadores
- **Profit Factor**: Ganancias promedio / Pérdidas promedio

## 🚀 Flujo de Ejecución

1. Usuario llama `/api/trading/activate?dateTimePrediction=2025-10-11T19:45`
2. Sistema busca 3 bloques anteriores (19:00, 19:15, 19:30)
3. Genera predicción con helper `predictFromBlocks`
4. Crea 2 setups (Momentum + Retest) en estado IDLE
5. Monitorea Mark Price cada segundo
6. Cuando se cumplen condiciones → ARMED → FILLED
7. Gestiona TP1, TP2, SL y trailing automáticamente
8. Emite eventos en cada transición
9. Guarda todo en MongoDB para análisis posterior

## ⚙️ Notas de Implementación

- **Simulación**: Actualmente simula fills (para testing)
- **Producción**: Necesitará integración con Binance API para órdenes reales
- **User Data Stream**: Pendiente para confirmaciones de exchange
- **Throttle**: Evita duplicados en ventana de tiempo
- **No Pyramiding**: Solo una posición activa del mismo lado por defecto
