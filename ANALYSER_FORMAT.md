# Analyser Service - Formato de salida

## Configuración (Variables de entorno)

```bash
# Habilitar/deshabilitar PrevClose (por defecto: true)
ANALYSER_PRINT_PREV_CLOSE=true|false

# Habilitar/deshabilitar tiempos tHigh/tLow (por defecto: true)
ANALYSER_PRINT_TIMES=true|false
```

## Formato de cada línea

Cada minuto se registra en una sola línea con el siguiente formato:

```
[Marca] [Emoji] Min [####] [[##]] | Open: $X.XX → Close: $X.XX | Fluct: ±X.XXXX% | Max: ±X.XXXX% | Min: ±X.XXXX% | Seq: XX [| tHigh: XXs] [| tLow: XXs] [| PrevClose: $X.XX]
```

### Campos:

- **Marca**: `⏰` si es minuto 00, 15, 30, 45 (inicio de vela 15min), `  ` (espacio) en otro caso
- **Emoji**:
  - 🟢 Si fluctuación positiva
  - 🔴 Si fluctuación negativa
  - 🟡 Si fluctuación = 0%
- **Min [####]**: Número de minuto global (contador desde inicio)
- **[[##]]**: Minuto del reloj (00-59)
- **Open/Close**: Precio con 2 decimales y prefijo `$`
- **Fluct**: Fluctuación `(close-open)/open * 100` con 4 decimales y signo (`+` o `-`)
- **Max**: Fluctuación máxima `(high-open)/open * 100` siempre ≥ 0, 4 decimales con signo
- **Min**: Fluctuación mínima `(low-open)/open * 100` siempre ≤ 0, 4 decimales con signo
- **Seq**: Secuencia de extremos:
  - `HL`: High alcanzado antes que Low
  - `LH`: Low alcanzado antes que High
  - `H-`: Solo hubo high > open (no bajó del open)
  - `-L`: Solo hubo low < open (no subió del open)
- **tHigh** (opcional): Segundo (0-59) donde se alcanzó el high por primera vez
- **tLow** (opcional): Segundo (0-59) donde se alcanzó el low por primera vez
- **PrevClose** (opcional): Precio de cierre del minuto anterior

## Ejemplos de salida

### Ejemplo 1: Minuto alcista con secuencia HL

```
   🟢 Min 0019 [02] | Open: $3735.42 → Close: $3748.86 | Fluct: +0.3598% | Max: +0.3601% | Min: -0.1179% | Seq: HL | tHigh: 12s | tLow: 45s | PrevClose: $3732.10
```

### Ejemplo 2: Minuto bajista con secuencia LH

```
   🔴 Min 0021 [04] | Open: $3754.94 → Close: $3746.67 | Fluct: -0.2202% | Max: +0.1590% | Min: -0.3230% | Seq: LH | tLow: 18s | tHigh: 51s | PrevClose: $3748.86
```

### Ejemplo 3: Inicio de vela de 15min (marca ⏰)

```
⏰ 🟢 Min 0030 [15] | Open: $3760.00 → Close: $3762.50 | Fluct: +0.0658% | Max: +0.0850% | Min: -0.0201% | Seq: HL | tHigh: 8s | tLow: 33s | PrevClose: $3758.42
```

### Ejemplo 4: Sin movimiento significativo

```
   🟡 Min 0033 [18] | Open: $3760.00 → Close: $3760.00 | Fluct: +0.0000% | Max: +0.0000% | Min: +0.0000% | Seq: H- | PrevClose: $3760.00
```

### Ejemplo 5: Solo bajó (sin high > open)

```
   🔴 Min 0045 [30] | Open: $3755.00 → Close: $3752.50 | Fluct: -0.0666% | Max: +0.0000% | Min: -0.0933% | Seq: -L | tLow: 25s | PrevClose: $3756.20
```

## Arquitectura técnica

### WebSockets conectados:

1. **Klines (velas 1m)**: `wss://fstream.binance.com/ws/ethusdt@kline_1m`
   - Detecta inicio y cierre de cada minuto
   - Proporciona OHLC oficial

2. **Trades (ticks)**: `wss://fstream.binance.com/ws/ethusdt@aggTrade`
   - Recibe cada trade en tiempo real
   - Rastrea orden de extremos (high/low) y timestamps

### Flujo de datos:

1. **Inicio de minuto** (kline con `x: false` y sin estado previo):
   - Inicializa `MinuteState` con open, high=open, low=open
   - Guarda `prevClosePx` del minuto anterior

2. **Durante el minuto** (cada trade):
   - Actualiza `closePx` con último precio
   - Si precio > high: actualiza high, y si es la primera vez que supera open, guarda `tHighSec`
   - Si precio < low: actualiza low, y si es la primera vez que baja del open, guarda `tLowSec`

3. **Cierre de minuto** (kline con `x: true`):
   - Calcula fluctuaciones, secuencia (Seq)
   - Emite log completo con todos los campos
   - Guarda en historial para reportes de 15min
   - Resetea estado

### Helpers:

- `pct(n)`: Formatea número a `±X.XXXX%`
- `usd(n)`: Formatea número a `$X.XX`
- `secondsWithinMinute(ts, startTs)`: Calcula segundo 0-59 dentro del minuto
- `computeSeq(state)`: Determina HL/LH/H-/-L según presencia de tHighSec/tLowSec

## Reportes cada 15 minutos

El sistema genera automáticamente reportes en `public/reports.md` cada vez que llega a los minutos :00, :15, :30, :45 del reloj.

Cada reporte incluye:

- Resumen de 15 minutos
- Predicción (LONG/SHORT/ESPERAR)
- Tabla con desglose minuto por minuto
