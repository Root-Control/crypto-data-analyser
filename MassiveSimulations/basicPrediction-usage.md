# BasicPrediction Usage Guide

## 📊 Cómo usar el sistema de predicción básica

### 🧪 Para ejecutar diferentes escenarios y encontrar la mejor configuración:

1. **Ir al directorio MassiveSimulations:**
   ```bash
   cd MassiveSimulations
   ```

2. **Ejecutar el test de laboratorio:**
   ```bash
   node laboratory-test.js
   ```

   Este comando ejecutará múltiples iteraciones con diferentes configuraciones del algoritmo para encontrar:
   - 🏆 **Mejor Precisión**: Configuración con mayor porcentaje de aciertos
   - 💰 **Mejor P&L**: Configuración con mayor ganancia absoluta
   - 🎯 **Mejor Combinado**: Balance óptimo entre precisión y P&L
   - ⚡ **Mejor Precisión Eficiente**: Mayor precisión con menos trades

### 🎯 Para aplicar una prueba directa con el algoritmo actual:

#### Opción 1: Usar configuración por defecto
1. **Abrir `testBasic.js`**
2. **Cambiar `useOptimalConfig` a `false`:**
   ```javascript
   const useOptimalConfig = false;
   ```
3. **Ejecutar:**
   ```bash
   node testBasic.js
   ```

#### Opción 2: Usar configuración optimizada
1. **Abrir `testBasic.js`**
2. **Cambiar los parámetros en `optimalConfig`:**
   ```javascript
   const optimalConfig = {
     TP_MULTIPLIER: 1.2,         
     TP_MAX_PERCENT: 0.005,       
     SL_PERCENT: 0.002,          
     FINAL_SCORE_THRESHOLD: 0.4,       
     RECENT_CANDLES_MOMENTUM: 15,       
     FLOW_RECENT_CANDLES: 3,           
     CLIMAX_RECENT_CANDLES: 7,         
   };
   ```
3. **Cambiar `useOptimalConfig` a `true`:**
   ```javascript
   const useOptimalConfig = true;
   ```
4. **Ejecutar:**
   ```bash
   node testBasic.js
   ```

## 🔧 Parámetros del Algoritmo

### Configuración de Trading:
- **TP_MULTIPLIER**: Multiplicador de Take Profit (1.0 - 3.0)
- **TP_MAX_PERCENT**: Take Profit máximo como porcentaje (0.005 - 0.1)
- **SL_PERCENT**: Stop Loss como porcentaje (0.002 - 0.05)

### Configuración del Algoritmo:
- **FINAL_SCORE_THRESHOLD**: Umbral para decisiones UP/DOWN vs SIDEWAYS (0.2 - 0.5)
- **RECENT_CANDLES_MOMENTUM**: Ventana de análisis de momentum (5 - 20)
- **FLOW_RECENT_CANDLES**: Ventana de análisis de flujo de volumen (2 - 7)
- **CLIMAX_RECENT_CANDLES**: Ventana de análisis de climax (3 - 10)

## 📈 Interpretación de Resultados

### Reportes del Laboratory Test:
- **Configuración [i,j,k,l]**: Índices de los arrays de parámetros probados
- **Precisión**: Porcentaje de predicciones correctas
- **P&L**: Ganancia/pérdida total en dólares
- **Trades ejecutados**: Número total de operaciones
- **Trades ganados/perdidos**: Desglose de resultados

### Recomendación de Uso:
1. Ejecutar `laboratory-test.js` para encontrar la mejor configuración
2. Aplicar la configuración ganadora en `testBasic.js`
3. Monitorear resultados en tiempo real

## 🚀 Flujo de Trabajo Recomendado

1. **Desarrollo**: Usar `laboratory-test.js` para optimizar parámetros
2. **Testing**: Usar `testBasic.js` con `useOptimalConfig = false` para pruebas rápidas
3. **Producción**: Usar `testBasic.js` con `useOptimalConfig = true` y parámetros optimizados
