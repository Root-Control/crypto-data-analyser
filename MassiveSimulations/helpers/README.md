# Helpers - MassiveSimulations

Esta carpeta contiene helpers útiles para las simulaciones de trading.

## liquidation.js

Helper para calcular precios de liquidación en trading con apalancamiento, basado en las fórmulas estándar de Binance Futures y otros exchanges.

### Funciones Principales

#### `calculateLongLiquidationPrice(entryPrice, leverage, maintenanceMarginRate)`
Calcula el precio de liquidación para una posición LARGA.

**Fórmula:** `Liquidation Price = Entry Price * (1 - Initial Margin Rate + Maintenance Margin Rate)`

**Parámetros:**
- `entryPrice` (number): Precio de entrada de la posición
- `leverage` (number): Apalancamiento utilizado (ej: 10 para 10x)
- `maintenanceMarginRate` (number): Tasa de margen de mantenimiento (default: 0.004 = 0.4%)

**Retorna:** Precio de liquidación para posición larga

#### `calculateShortLiquidationPrice(entryPrice, leverage, maintenanceMarginRate)`
Calcula el precio de liquidación para una posición CORTA.

**Fórmula:** `Liquidation Price = Entry Price * (1 + Initial Margin Rate - Maintenance Margin Rate)`

**Parámetros:**
- `entryPrice` (number): Precio de entrada de la posición
- `leverage` (number): Apalancamiento utilizado (ej: 10 para 10x)
- `maintenanceMarginRate` (number): Tasa de margen de mantenimiento (default: 0.004 = 0.4%)

**Retorna:** Precio de liquidación para posición corta

#### `calculateLiquidationPrice(side, entryPrice, leverage, maintenanceMarginRate)`
Calcula el precio de liquidación para cualquier tipo de posición.

**Parámetros:**
- `side` (string): 'LONG' o 'SHORT'
- `entryPrice` (number): Precio de entrada de la posición
- `leverage` (number): Apalancamiento utilizado
- `maintenanceMarginRate` (number): Tasa de margen de mantenimiento (default: 0.004)

**Retorna:** Precio de liquidación

### Funciones de Margen

#### `calculateInitialMargin(notionalValue, leverage)`
Calcula el margen inicial requerido para una posición.

#### `calculateMaintenanceMargin(notionalValue, maintenanceMarginRate)`
Calcula el margen de mantenimiento requerido para una posición.

#### `calculateMarginRatio(currentPrice, entryPrice, side, leverage, maintenanceMarginRate)`
Calcula el ratio de margen actual de una posición.

### Funciones de Análisis de Riesgo

#### `checkLiquidationRisk(currentPrice, entryPrice, side, leverage, maintenanceMarginRate, warningThreshold)`
Verifica si una posición está en riesgo de liquidación.

**Retorna:**
```javascript
{
  status: 'SAFE' | 'WARNING' | 'LIQUIDATED',
  marginRatio: number,
  liquidationPrice: number,
  isAtRisk: boolean,
  isLiquidated: boolean
}
```

### Ejemplo de Uso

```javascript
const { calculateLiquidationPrice, checkLiquidationRisk } = require('./liquidation');

// Calcular precio de liquidación para posición larga
const liquidationPrice = calculateLiquidationPrice('LONG', 4000, 10, 0.004);
console.log(`Precio de liquidación: $${liquidationPrice}`);

// Verificar riesgo de liquidación
const risk = checkLiquidationRisk(3950, 4000, 'LONG', 10, 0.004);
console.log(`Estado: ${risk.status}`);
console.log(`Ratio de margen: ${(risk.marginRatio * 100).toFixed(2)}%`);
```

### Fórmulas Utilizadas

#### Posición Larga (LONG)
```
Liquidation Price = Entry Price × (1 - 1/Leverage + Maintenance Margin Rate)
```

#### Posición Corta (SHORT)
```
Liquidation Price = Entry Price × (1 + 1/Leverage - Maintenance Margin Rate)
```

#### Margen Inicial
```
Initial Margin = Notional Value / Leverage
```

#### Margen de Mantenimiento
```
Maintenance Margin = Notional Value × Maintenance Margin Rate
```

### Notas Importantes

1. **Tasas de Margen:** Las tasas de margen de mantenimiento varían según el exchange y el activo. Binance Futures típicamente usa 0.4% (0.004) para ETHUSDT.

2. **Apalancamiento:** El apalancamiento se expresa como un número entero (ej: 10 para 10x, 5 para 5x).

3. **Precios:** Todos los precios deben estar en la misma unidad (ej: USD para ETHUSDT).

4. **Riesgo:** Los cálculos asumen que no hay comisiones adicionales que afecten el margen.

### Archivos Relacionados

- `liquidation-example.js`: Ejemplos de uso del helper
- `README.md`: Esta documentación
