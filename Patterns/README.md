# Patterns Detection System

Sistema de detección y análisis de patrones de velas japonesas en datos históricos de criptomonedas.

## 📁 Estructura del Proyecto

```
Patterns/
├── backtest/                    # Scripts de backtesting
│   ├── pattern-backtest.js     # Script principal de detección
│   └── pattern-backtester.js   # Backtester avanzado
├── single-candle/              # Patrones de una vela
│   ├── doji.js
│   ├── hammer.js
│   ├── marubozu.js
│   └── ...
├── double-candle/              # Patrones de dos velas
│   ├── engulfing.js
│   ├── harami.js
│   └── ...
├── triple-candle/              # Patrones de tres velas
│   ├── three-black-crows.js
│   ├── morning-star.js
│   └── ...
├── chart-patterns/             # Patrones chartistas
│   ├── head-and-shoulders.js
│   ├── double-top.js
│   └── ...
├── utils.js                    # Funciones utilitarias
└── Reports/                    # Reportes PDF generados
```

## 🚀 Comandos Principales

### 1. Detección Completa (Todos los Patrones)

```bash
# Procesar TODAS las 100,000 velas con todos los patrones
SCAN_SINGLE=true SCAN_DOUBLE=true SCAN_TRIPLE=true SCAN_CHART=true MAX_QTY=0 node Patterns/backtest/pattern-backtest.js

# Procesar solo las últimas 20,000 velas con todos los patrones
SCAN_SINGLE=true SCAN_DOUBLE=true SCAN_TRIPLE=true SCAN_CHART=true MAX_QTY=20000 node Patterns/backtest/pattern-backtest.js
```

### 2. Detección por Categoría

#### Solo Patrones de Una Vela

```bash
SCAN_SINGLE=true SCAN_DOUBLE=false SCAN_TRIPLE=false SCAN_CHART=false MAX_QTY=20000 node Patterns/backtest/pattern-backtest.js
```

#### Solo Patrones de Dos Velas

```bash
SCAN_SINGLE=false SCAN_DOUBLE=true SCAN_TRIPLE=false SCAN_CHART=false MAX_QTY=20000 node Patterns/backtest/pattern-backtest.js
```

#### Solo Patrones de Tres Velas (Incluye Three Black Crows)

```bash
SCAN_SINGLE=false SCAN_DOUBLE=false SCAN_TRIPLE=true SCAN_CHART=false MAX_QTY=20000 node Patterns/backtest/pattern-backtest.js
```

#### Solo Patrones Chartistas

```bash
SCAN_SINGLE=false SCAN_DOUBLE=false SCAN_TRIPLE=false SCAN_CHART=true MAX_QTY=20000 node Patterns/backtest/pattern-backtest.js
```

### 3. Configuración con Variables de Entorno (.env)

Crear archivo `.env` en la raíz del proyecto:

```env
# Control de escaneo de patrones
SCAN_SINGLE=true
SCAN_DOUBLE=true
SCAN_TRIPLE=true
SCAN_CHART=true

# Cantidad de velas a procesar (0 = todas)
MAX_QTY=20000

# Forzar nueva descarga de datos (opcional)
FORCE_NEW_DATA=false
```

Luego ejecutar:

```bash
node Patterns/backtest/pattern-backtest.js
```

### 4. Comandos de Desarrollo

#### Procesar Muestra Pequeña (5,000 velas)

```bash
SCAN_SINGLE=true SCAN_DOUBLE=true SCAN_TRIPLE=true SCAN_CHART=true MAX_QTY=5000 node Patterns/backtest/pattern-backtest.js
```

#### Solo Marubozu (Patrón específico)

```bash
SCAN_SINGLE=true SCAN_DOUBLE=false SCAN_TRIPLE=false SCAN_CHART=false MAX_QTY=20000 node Patterns/backtest/pattern-backtest.js
```

#### Solo Three Black Crows (con filtrado de duplicados)

```bash
SCAN_SINGLE=false SCAN_DOUBLE=false SCAN_TRIPLE=true SCAN_CHART=false MAX_QTY=20000 node Patterns/backtest/pattern-backtest.js
```

## 📊 Características Especiales

### Filtrado de Duplicados Temporales

- **Three Black Crows**: Automáticamente filtra duplicados que están a 15 minutos de diferencia
- **Lógica**: Mantiene la detección más antigua, elimina las confirmaciones posteriores
- **Resultado**: Reduce ~20% de detecciones redundantes

### Reportes PDF

- **Ubicación**: `Patterns/Reports/`
- **Formato**: Ordenados del más actual al más antiguo
- **Timestamps**: Incluye hora de Perú y México en formato DD/MM/YYYY HH:MM:SS

### Cache Redis

- **Datos**: 100,000 velas históricas almacenadas permanentemente
- **Símbolo**: ETHUSDT
- **Intervalo**: 15 minutos
- **Sin TTL**: Los datos se mantienen indefinidamente

## 🔧 Variables de Entorno

| Variable         | Descripción                     | Valores               | Default |
| ---------------- | ------------------------------- | --------------------- | ------- |
| `SCAN_SINGLE`    | Escanear patrones de una vela   | `true`/`false`        | `true`  |
| `SCAN_DOUBLE`    | Escanear patrones de dos velas  | `true`/`false`        | `true`  |
| `SCAN_TRIPLE`    | Escanear patrones de tres velas | `true`/`false`        | `true`  |
| `SCAN_CHART`     | Escanear patrones chartistas    | `true`/`false`        | `true`  |
| `MAX_QTY`        | Cantidad de velas a procesar    | `0` (todas), `número` | `0`     |
| `FORCE_NEW_DATA` | Forzar nueva descarga           | `true`/`false`        | `false` |

## 📈 Ejemplos de Salida

### Detección Exitosa

```
🔍 Three Black Crows: Filtrados 48 duplicados temporales (246 → 198)
✅ Generated individual three-black-crows report: .../three-black-crows-report.pdf
📊 Total patterns found: 221
📈 Pattern counts by type:
  triple-candle: 221 detections
```

### Configuración de Escaneo

```
🔧 Scanning configuration:
   Single-candle: ✅ ENABLED
   Double-candle: ❌ DISABLED
   Triple-candle: ✅ ENABLED
   Chart patterns: ❌ DISABLED
```

## 🚨 Troubleshooting

### Error: "No patterns found"

- Verificar que las variables de entorno estén configuradas correctamente
- Asegurarse de que al menos una categoría esté habilitada

### Error: "Redis connection failed"

- Verificar que Redis esté ejecutándose: `redis-server`
- Verificar conexión en puerto 6379

### Reportes vacíos

- Verificar que se hayan detectado patrones en la categoría correspondiente
- Revisar logs de detección en consola

## 📝 Notas Importantes

1. **Look-ahead bias**: El sistema está diseñado para NO usar velas futuras en la detección
2. **Filtrado automático**: Three Black Crows incluye filtrado de duplicados temporales
3. **Cache permanente**: Los datos se almacenan sin TTL para análisis repetitivos
4. **Reportes ordenados**: Siempre del más reciente al más antiguo
5. **Timezone support**: Timestamps en formato Lima y México
