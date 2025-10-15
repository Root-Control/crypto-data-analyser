# Flujo de Algoritmos de Predicción

## 📋 Resumen General

El sistema de predicciones utiliza **4 algoritmos diferentes** que analizan datos históricos de velas y order book para predecir movimientos de precio. Cada algoritmo tiene un enfoque específico y se ejecuta de forma independiente.

## 🔄 Flujo General del Sistema

```
1. 📊 RECEPCIÓN DE DATOS
   ├── Velas históricas (HistoricalCandle[])
   ├── Order book actual (BookSnapshot)
   └── Parámetros de trading (capital, leverage)

2. 🧠 EJECUCIÓN DE ALGORITMOS
   ├── Algoritmo 1: Basic Prediction
   ├── Algoritmo 2: Refined Prediction
   ├── Algoritmo 3: Soft-Refined Prediction
   └── Algoritmo 4: Sideway Prediction

3. 📈 ANÁLISIS DE RESULTADOS
   ├── Cada algoritmo retorna: direction, confidence, expectedMove, riskLevel
   ├── Se calculan métricas: evaluated, correct, incorrect, accuracy
   └── Se calcula PnL: totalPnL, pnlPercent

4. 💰 EJECUCIÓN DE TRADES
   ├── Se ejecuta trade individual para cada algoritmo
   ├── Solo si direction ≠ 'SIDEWAYS'
   └── Se registra resultado en Binance

5. 📊 ALMACENAMIENTO
   ├── Resultados guardados en Redis
   ├── Métricas agregadas en response
   └── Logs detallados para análisis
```

---

## 🧮 Algoritmo 1: Basic Prediction

### **Enfoque**: Motor de predicción genérico

### **Complejidad**: Baja

### **Datos mínimos**: 3 velas

```typescript
// Flujo simplificado
basicPrediction(historicalCandles, currentBook, minCandles) {
  return predictNextCandle(historicalCandles, currentBook, minCandles);
}
```

**Características:**

- ✅ **Más simple**: Solo llama al motor de predicción base
- ✅ **Rápido**: Procesamiento mínimo
- ❌ **Menos preciso**: No tiene análisis especializado
- ❌ **Genérico**: No se adapta a condiciones específicas

**Uso recomendado**: Benchmark base, comparación de rendimiento

---

## 🎯 Algoritmo 2: Refined Prediction

### **Enfoque**: Análisis multi-dimensional optimizado

### **Complejidad**: Alta

### **Datos mínimos**: 3 velas

```typescript
// Flujo detallado
refinedPrediction(historicalCandles, currentBook, minCandles) {
  // FASE 1: Análisis de Momentum
  const momentum = analyzeMomentumImproved(historicalCandles);

  // FASE 2: Análisis de Order Book
  const bookPressure = analyzeBookPressureImproved(currentBook, historicalCandles);

  // FASE 3: Análisis de Volume Flow
  const flowScore = analyzeVolumeFlowImproved(historicalCandles);

  // FASE 4: Análisis de Climax
  const climaxScore = analyzeClimaxPressureImproved(historicalCandles);

  // FASE 5: Decisión final con gating
  return calculateFinalPrediction(momentum, bookPressure, flowScore, climaxScore);
}
```

**Características:**

- ✅ **Análisis completo**: 4 fases de análisis
- ✅ **Optimizado para profit**: Enfocado en movimientos rentables
- ✅ **Gating inteligente**: Filtros anti-SIDEWAYS
- ✅ **Alineación Momentum+Book**: Requiere acuerdo entre señales
- ❌ **Complejo**: Muchos parámetros y cálculos

**Uso recomendado**: Trading activo, señales de alta calidad

---

## 🌊 Algoritmo 3: Soft-Refined Prediction

### **Enfoque**: Análisis suavizado y balanceado

### **Complejidad**: Media-Alta

### **Datos mínimos**: 3 velas

```typescript
// Flujo balanceado
softRefined(historicalCandles, currentBook, minCandles) {
  // FASE 1: Momentum mejorado con múltiples timeframes
  const momentum = analyzeMomentumImproved(historicalCandles);

  // FASE 2: Order Book con análisis de convergencia
  const bookPressure = analyzeBookPressureImproved(currentBook, historicalCandles);

  // FASE 3: Volume Flow con aceleración
  const flowScore = analyzeVolumeFlowImproved(historicalCandles);

  // FASE 4: Climax con análisis de momentum
  const climaxScore = analyzeClimaxPressureImproved(historicalCandles);

  // FASE 5: Decisión balanceada (menos estricta que Refined)
  return calculateFinalPredictionImproved(momentum, bookPressure, flowScore, climaxScore);
}
```

**Características:**

- ✅ **Balanceado**: Menos estricto que Refined
- ✅ **Más señales**: Genera más predicciones válidas
- ✅ **Análisis suavizado**: Ponderación optimizada
- ✅ **VWAP + multiminuto**: Características adicionales
- ⚖️ **Intermedio**: Entre Basic y Refined en complejidad

**Uso recomendado**: Trading balanceado, más señales con buena calidad

---

## 📊 Algoritmo 4: Sideway Prediction

### **Enfoque**: Trading de rangos y mean reversion

### **Complejidad**: Alta

### **Datos mínimos**: 15 velas (más datos para rangos)

```typescript
// Flujo especializado en rangos
sidewayPrediction(historicalCandles, currentBook, minCandles) {
  // ADAPTACIÓN SEGÚN CANTIDAD DE DATOS
  const adaptationMode = getAdaptationMode(historicalCandles.length);

  // FASE 1: Análisis de Rango Lateral
  const rangeAnalysis = analyzePriceRange(historicalCandles);

  // FASE 2: Soportes y Resistencias
  const supportResistance = identifySupportResistance(historicalCandles);

  // FASE 3: Mean Reversion
  const meanReversion = analyzeMeanReversion(historicalCandles);

  // FASE 4: Volatilidad y Breakout
  const volatilityAnalysis = analyzeVolatility(historicalCandles);

  // FASE 5: Decisión especializada en rangos
  return calculateSidewayPrediction(rangeAnalysis, supportResistance, meanReversion, volatilityAnalysis);
}
```

**Características:**

- ✅ **Especializado**: Enfocado en trading de rangos
- ✅ **Adaptativo**: Se ajusta según cantidad de datos
- ✅ **Mean reversion**: Detecta reversiones a la media
- ✅ **Soportes/Resistencias**: Análisis técnico avanzado
- ❌ **Requiere más datos**: Mínimo 15 velas
- ❌ **Específico**: Solo para mercados laterales

**Uso recomendado**: Mercados laterales, trading de rangos

---

## 📊 Comparación de Algoritmos

| Algoritmo        | Complejidad | Velocidad  | Precisión  | Señales   | Enfoque    |
| ---------------- | ----------- | ---------- | ---------- | --------- | ---------- |
| **Basic**        | Baja        | Muy Rápida | Baja       | Muchas    | Genérico   |
| **Refined**      | Alta        | Lenta      | Alta       | Pocas     | Profit     |
| **Soft-Refined** | Media-Alta  | Media      | Media-Alta | Moderadas | Balanceado |
| **Sideway**      | Alta        | Lenta      | Alta\*     | Pocas     | Rangos     |

\*Alta precisión solo en mercados laterales

---

## 🔄 Flujo de Ejecución en el Sistema

### 1. **Recepción de Datos**

```typescript
// En predictions.service.ts
const prediction = refinedPrediction(allCandles, currentBook, 3);
const prediction2 = softRefined(allCandles, currentBook, 3);
```

### 2. **Cálculo de Trading Setup**

```typescript
// Para cada algoritmo
const tradingSetup = calculateTradingSetup(
  newCandle,
  prediction,
  capital,
  leverage,
);
const tradingSetup2 = calculateTradingSetup(
  newCandle,
  prediction2,
  capital,
  leverage,
);
```

### 3. **Ejecución de Trades Individuales**

```typescript
// Trade para cada algoritmo independientemente
if (tradingSetup.direction !== 'SIDEWAYS') {
  await binanceService.executeTrade({ ...tradingSetup, symbol: 'ETHUSDT' });
}
if (tradingSetup2.direction !== 'SIDEWAYS') {
  await binanceService.executeTrade({ ...tradingSetup2, symbol: 'ETHUSDT' });
}
```

### 4. **Almacenamiento de Resultados**

```typescript
// En Redis se guarda:
{
  lastPrediction: { direction, confidence, expectedMove, riskLevel },
  lastPrediction2: { direction, confidence, expectedMove, riskLevel, breakdown },
  lastTrading1: { entryPrice, takeProfit, stopLoss, positionSize, ... },
  lastTrading2: { entryPrice, takeProfit, stopLoss, positionSize, ... }
}
```

---

## 🎯 Recomendaciones de Uso

### **Para Trading Activo:**

- **Refined**: Máxima precisión, pocas señales de alta calidad
- **Soft-Refined**: Balance entre cantidad y calidad de señales

### **Para Análisis:**

- **Basic**: Benchmark base, comparación de rendimiento
- **Sideway**: Mercados laterales, análisis de rangos

### **Para Desarrollo:**

- **Soft-Refined**: Base para nuevos algoritmos
- **Refined**: Referencia de análisis avanzado

---

## 📈 Métricas de Evaluación

Cada algoritmo se evalúa con:

- **evaluated**: Total de predicciones evaluadas
- **correct**: Predicciones correctas
- **incorrect**: Predicciones incorrectas (evaluated - correct)
- **accuracy**: Precisión en porcentaje
- **totalPnL**: Profit & Loss total
- **pnlPercent**: PnL en porcentaje

---

_Documentación generada automáticamente - Última actualización: 2025-10-15_
