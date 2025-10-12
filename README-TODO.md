# 🎯 TRADING SIMULATOR - IMPLEMENTACIÓN COMPLETA

## 📋 OBJETIVO PRINCIPAL

**Probar que el trailing funciona correctamente ANTES de aplicarlo a señales reales PinVol.**

### ¿Para qué?

1. **Confirmar** que el trailing funciona tal cual esperamos
2. **Recolectar datos** sobre si las señales tienden a ser DIRECT o REBOUND
3. **Tomar decisiones** sobre la estrategia de entrada (inmediata vs esperar rebote)

---

## 🏗️ ARQUITECTURA

```
┌─────────────────────────────────────────────────────────────┐
│                  BinanceWebSocketGateway                     │
│              (NO TOCAR - YA FUNCIONA PERFECTO)              │
│         • Detecta señales PinVol reales                      │
│         • Envía a Telegram                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Módulo: tests                             │
│              (PARA PROBAR EL TRAILING)                       │
│         • WebSocket ETH Futures 15m                          │
│         • Cada vela = señal simulada                         │
│         • Crea simulación con TradingSimulatorService        │
│         • Actualiza precio en tiempo real                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                Módulo: trading-simulator                     │
│              (LÓGICA DE TRAILING PURA)                       │
│         • Schema MongoDB                                     │
│         • Lógica de trailing LONG/SHORT                      │
│         • Detecta DIRECT vs REBOUND                          │
│         • Guarda resultados                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 MÓDULO 1: `trading-simulator`

### 📊 Schema MongoDB

```typescript
{
  // Identidad
  symbol: string; // "ETHUSDT"
  side: 'LONG' | 'SHORT'; // Dirección
  status: 'ACTIVE' | 'FILLED'; // Estado

  // Datos de la señal
  signalPrice: number; // Precio de la vela señal (P0)
  signalTime: Date; // Timestamp de la vela

  // Metadata del símbolo (para cuantización)
  symbolMetadata: {
    tickSize: number; // 0.01 para ETH
    pricePrecision: number; // 2 para ETH
  }

  // Trailing (SOLO ESTOS CAMPOS)
  trailingLevels: {
    p0: number; // Precio base (4000)
    executionPrice: number; // Precio de ejecución (4004 para LONG)
    callbackRate: number; // 0.001 (0.1%)
  }

  // Estado actual
  currentPrice: number; // Último precio visto
  lastUpdate: Date; // Última actualización

  // Resultados (cuando se ejecuta)
  fillPrice: number; // Precio de ejecución real
  fillTime: Date; // Timestamp de ejecución
  executionType: 'DIRECT' | 'REBOUND'; // Tipo de ejecución

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 🔧 LÓGICA DE TRAILING

### 📈 LONG (Compra)

#### **Inicialización:**

```
P0 = 4000 (precio de la vela señal)
executionPrice = P0 * (1 + 0.001) = 4004
callbackRate = 0.001 (0.1%)
```

#### **Actualización de `executionPrice`:**

**REGLA:**

- `executionPrice` solo baja si `currentPrice` alcanza `executionPrice * (1 - callbackRate)`

**Ejemplos:**

**Ejemplo 1: Precio sube directamente**

```
P0 = 4000
executionPrice = 4004

Tick 1: currentPrice = 4001 → NO pasa nada
Tick 2: currentPrice = 4003 → NO pasa nada
Tick 3: currentPrice = 4004 → FILLED (DIRECT)
```

**Ejemplo 2: Precio baja y luego sube**

```
P0 = 4000
executionPrice = 4004

Tick 1: currentPrice = 3999 → NO pasa nada (no alcanza umbral)
Tick 2: currentPrice = 3996 → executionPrice baja a 4000 (porque 3996 < 4004 * 0.999 = 3999.996)
Tick 3: currentPrice = 3995 → NO pasa nada (no alcanza nuevo umbral)
Tick 4: currentPrice = 3992 → executionPrice baja a 3996 (porque 3992 < 4000 * 0.999 = 3996)
Tick 5: currentPrice = 4000 → FILLED (REBOUND)
```

**Ejemplo 3: Precio baja mucho y luego sube**

```
P0 = 4000
executionPrice = 4004

Tick 1: currentPrice = 3990 → executionPrice baja a 3994 (múltiples peldaños)
Tick 2: currentPrice = 3985 → executionPrice baja a 3989
Tick 3: currentPrice = 3990 → FILLED (REBOUND)
```

#### **Condición de FILLED:**

```typescript
if (currentPrice >= executionPrice) {
  status = 'FILLED';
  fillPrice = currentPrice;
  fillTime = now;

  // Determinar tipo de ejecución
  if (fillPrice >= p0 * (1 + callbackRate)) {
    executionType = 'DIRECT'; // Se fue directo para arriba
  } else {
    executionType = 'REBOUND'; // Bajó y rebotó
  }
}
```

---

### 📉 SHORT (Venta)

#### **Inicialización:**

```
P0 = 4000 (precio de la vela señal)
executionPrice = P0 * (1 - 0.001) = 3996
callbackRate = 0.001 (0.1%)
```

#### **Actualización de `executionPrice`:**

**REGLA:**

- `executionPrice` solo sube si `currentPrice` alcanza `executionPrice * (1 + callbackRate)`

**Ejemplos:**

**Ejemplo 1: Precio baja directamente**

```
P0 = 4000
executionPrice = 3996

Tick 1: currentPrice = 3999 → NO pasa nada
Tick 2: currentPrice = 3997 → NO pasa nada
Tick 3: currentPrice = 3996 → FILLED (DIRECT)
```

**Ejemplo 2: Precio sube y luego baja**

```
P0 = 4000
executionPrice = 3996

Tick 1: currentPrice = 4001 → NO pasa nada
Tick 2: currentPrice = 4004 → executionPrice sube a 4000 (porque 4004 > 3996 * 1.001 = 3999.996)
Tick 3: currentPrice = 4008 → executionPrice sube a 4004 (porque 4008 > 4000 * 1.001 = 4004)
Tick 4: currentPrice = 4000 → FILLED (REBOUND)
```

#### **Condición de FILLED:**

```typescript
if (currentPrice <= executionPrice) {
  status = 'FILLED';
  fillPrice = currentPrice;
  fillTime = now;

  // Determinar tipo de ejecución
  if (fillPrice <= p0 * (1 - callbackRate)) {
    executionType = 'DIRECT'; // Se fue directo para abajo
  } else {
    executionType = 'REBOUND'; // Subió y rebotó
  }
}
```

---

## 🧪 MÓDULO 2: `tests`

### 📡 WebSocket Connection

```typescript
@Injectable()
export class TestsService implements OnModuleInit {
  private ws: WebSocket;
  private activeSimulations: Set<string> = new Set();

  constructor(
    private readonly tradingSimulatorService: TradingSimulatorService,
    private readonly symbolMetadataService: SymbolMetadataService,
  ) {}

  async onModuleInit() {
    // Obtener metadata de ETHUSDT
    const metadata = await this.symbolMetadataService.getBySymbol('ETHUSDT');

    // Conectar a WebSocket
    this.connectToEthWebSocket();
  }

  private connectToEthWebSocket() {
    const url = 'wss://fstream.binance.com/ws/ethusdt@kline_15m';
    this.ws = new WebSocket(url);

    this.ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      this.handleKlineEvent(event);
    });
  }

  private async handleKlineEvent(event: any) {
    const kline = event.k;

    // Solo procesar cuando la vela cierra
    if (!kline.x) {
      // Actualizar simulaciones activas
      await this.updateActiveSimulations(parseFloat(kline.c), kline.T);
      return;
    }

    // Vela cerrada = nueva señal simulada
    console.log(
      `[TESTS] 🕐 Vela cerrada a las ${new Date(kline.T).toISOString()}`,
    );
    console.log(`[TESTS] 📊 Precio de cierre: ${kline.c}`);

    // Crear nueva simulación
    await this.createSimulation(event);
  }

  private async createSimulation(event: any) {
    const kline = event.k;
    const metadata = await this.symbolMetadataService.getBySymbol('ETHUSDT');

    const signalData = {
      symbol: 'ETHUSDT',
      signalType: 'LONG', // Siempre LONG para pruebas
      candleData: {
        openTime: kline.t,
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
        closeTime: kline.T,
      },
      metadata: {
        tickSize: metadata.tickSize,
        pricePrecision: metadata.pricePrecision,
      },
      timestamp: Date.now(),
    };

    const simulation =
      await this.tradingSimulatorService.createSimulation(signalData);
    this.activeSimulations.add(simulation._id.toString());

    console.log(`[TESTS] ✅ Simulación creada: ${simulation._id}`);
    console.log(
      `[TESTS] 📊 P0: ${simulation.trailingLevels.p0}, ExecutionPrice: ${simulation.trailingLevels.executionPrice}`,
    );
  }

  private async updateActiveSimulations(
    currentPrice: number,
    timestamp: number,
  ) {
    for (const simId of this.activeSimulations) {
      const result = await this.tradingSimulatorService.updatePrice(
        simId,
        currentPrice,
        timestamp,
      );

      if (result.triggered) {
        const sim = await this.tradingSimulatorService.getSimulation(simId);
        console.log(`[TESTS] 🎯 SIMULACIÓN EJECUTADA: ${simId}`);
        console.log(`[TESTS] 📊 Tipo: ${sim.executionType}`);
        console.log(`[TESTS] 💰 FillPrice: ${sim.fillPrice}`);
        console.log(`[TESTS] 📈 P0: ${sim.trailingLevels.p0}`);

        // Remover de activas
        this.activeSimulations.delete(simId);
      }
    }
  }
}
```

---

## 📊 CASOS DE PRUEBA

### ✅ Test 1: Precio sube directamente (DIRECT)

**Setup:**

```
P0 = 4000
executionPrice = 4004
```

**Secuencia:**

```
currentPrice = 4001 → status: ACTIVE
currentPrice = 4002 → status: ACTIVE
currentPrice = 4004 → status: FILLED, executionType: DIRECT
```

**Resultado esperado:**

- ✅ `status = "FILLED"`
- ✅ `executionType = "DIRECT"`
- ✅ `fillPrice = 4004`

---

### ✅ Test 2: Precio baja y luego sube (REBOUND)

**Setup:**

```
P0 = 4000
executionPrice = 4004
```

**Secuencia:**

```
currentPrice = 3999 → status: ACTIVE, executionPrice: 4004
currentPrice = 3996 → status: ACTIVE, executionPrice: 4000 (bajó un peldaño)
currentPrice = 3995 → status: ACTIVE, executionPrice: 4000
currentPrice = 3992 → status: ACTIVE, executionPrice: 3996 (bajó otro peldaño)
currentPrice = 3998 → status: FILLED, executionType: REBOUND
```

**Resultado esperado:**

- ✅ `status = "FILLED"`
- ✅ `executionType = "REBOUND"`
- ✅ `fillPrice = 3998`
- ✅ `executionPrice` bajó en peldaños correctos

---

### ✅ Test 3: `executionPrice` solo baja en peldaños de 0.1%

**Setup:**

```
P0 = 4000
executionPrice = 4004
```

**Secuencia:**

```
currentPrice = 3999 → executionPrice: 4004 (NO cambia, umbral es 3999.996)
currentPrice = 3996 → executionPrice: 4000 (SÍ cambia, alcanzó umbral)
currentPrice = 3997 → executionPrice: 4000 (NO cambia, umbral es 3996)
```

**Resultado esperado:**

- ✅ `executionPrice` solo cambia cuando se alcanza el umbral exacto
- ✅ NO cambia por centavos

---

## 🎯 IMPLEMENTACIÓN PASO POR PASO

### Paso 1: Crear módulo `trading-simulator`

```bash
nest g module modules/trading-simulator
nest g service modules/trading-simulator/services/trading-simulator
nest g controller modules/trading-simulator/controllers/trading-simulator
```

**Archivos:**

- `schemas/trading-simulator.schema.ts` → Schema MongoDB
- `dtos/trading-simulator.dto.ts` → DTOs
- `services/trading-simulator.service.ts` → Lógica de trailing
- `controllers/trading-simulator.controller.ts` → Endpoints API
- `trading-simulator.module.ts` → Module definition

---

### Paso 2: Implementar lógica de trailing

**`trading-simulator.service.ts`:**

```typescript
async createSimulation(signalData: SignalData): Promise<TradingSimulatorDocument> {
  const p0 = signalData.candleData.close;

  let executionPrice: number;
  if (signalData.signalType === 'LONG') {
    executionPrice = this.quantizePrice(
      p0 * (1 + 0.001),
      signalData.metadata.tickSize,
      signalData.metadata.pricePrecision,
    );
  } else {
    executionPrice = this.quantizePrice(
      p0 * (1 - 0.001),
      signalData.metadata.tickSize,
      signalData.metadata.pricePrecision,
    );
  }

  const simulation = new this.tradingSimulatorModel({
    symbol: signalData.symbol,
    side: signalData.signalType,
    status: 'ACTIVE',
    signalPrice: p0,
    signalTime: new Date(signalData.candleData.closeTime),
    symbolMetadata: signalData.metadata,
    trailingLevels: {
      p0,
      executionPrice,
      callbackRate: 0.001,
    },
    currentPrice: p0,
    lastUpdate: new Date(),
  });

  return simulation.save();
}

async updatePrice(
  simulationId: string,
  currentPrice: number,
  timestamp: number,
): Promise<{ updated: boolean; triggered: boolean }> {
  const sim = await this.tradingSimulatorModel.findById(simulationId);

  if (!sim || sim.status !== 'ACTIVE') {
    return { updated: false, triggered: false };
  }

  sim.currentPrice = currentPrice;
  sim.lastUpdate = new Date(timestamp);

  const { p0, executionPrice, callbackRate } = sim.trailingLevels;

  if (sim.side === 'LONG') {
    // Verificar si debe bajar executionPrice
    const threshold = executionPrice * (1 - callbackRate);

    if (currentPrice <= threshold) {
      const newExecutionPrice = this.quantizePrice(
        currentPrice * (1 + callbackRate),
        sim.symbolMetadata.tickSize,
        sim.symbolMetadata.pricePrecision,
      );

      sim.trailingLevels.executionPrice = newExecutionPrice;
      sim.markModified('trailingLevels');
    }

    // Verificar FILLED
    if (currentPrice >= sim.trailingLevels.executionPrice) {
      sim.status = 'FILLED';
      sim.fillPrice = currentPrice;
      sim.fillTime = new Date(timestamp);

      // Determinar tipo
      if (currentPrice >= p0 * (1 + callbackRate)) {
        sim.executionType = 'DIRECT';
      } else {
        sim.executionType = 'REBOUND';
      }

      await sim.save();
      return { updated: true, triggered: true };
    }
  } else {
    // SHORT: lógica inversa
    const threshold = executionPrice * (1 + callbackRate);

    if (currentPrice >= threshold) {
      const newExecutionPrice = this.quantizePrice(
        currentPrice * (1 - callbackRate),
        sim.symbolMetadata.tickSize,
        sim.symbolMetadata.pricePrecision,
      );

      sim.trailingLevels.executionPrice = newExecutionPrice;
      sim.markModified('trailingLevels');
    }

    // Verificar FILLED
    if (currentPrice <= sim.trailingLevels.executionPrice) {
      sim.status = 'FILLED';
      sim.fillPrice = currentPrice;
      sim.fillTime = new Date(timestamp);

      // Determinar tipo
      if (currentPrice <= p0 * (1 - callbackRate)) {
        sim.executionType = 'DIRECT';
      } else {
        sim.executionType = 'REBOUND';
      }

      await sim.save();
      return { updated: true, triggered: true };
    }
  }

  await sim.save();
  return { updated: true, triggered: false };
}

private quantizePrice(
  price: number,
  tickSize: number,
  precision: number,
): number {
  const units = Math.round(price / tickSize);
  return parseFloat((units * tickSize).toFixed(precision));
}
```

---

### Paso 3: Crear módulo `tests`

```bash
nest g module modules/tests
nest g service modules/tests/services/tests
nest g controller modules/tests/controllers/tests
```

**Archivos:**

- `services/tests.service.ts` → WebSocket + simulaciones
- `controllers/tests.controller.ts` → Endpoints básicos
- `tests.module.ts` → Module definition

---

### Paso 4: Verificar en MongoDB

**Query para ver resultados:**

```javascript
db.tradingsimulators.find({ status: 'FILLED' }).forEach((doc) => {
  print(`Symbol: ${doc.symbol}`);
  print(`Side: ${doc.side}`);
  print(`Type: ${doc.executionType}`);
  print(`P0: ${doc.trailingLevels.p0}`);
  print(`FillPrice: ${doc.fillPrice}`);
  print(`---`);
});
```

**Estadísticas:**

```javascript
const total = db.tradingsimulators.countDocuments({ status: 'FILLED' });
const direct = db.tradingsimulators.countDocuments({ executionType: 'DIRECT' });
const rebound = db.tradingsimulators.countDocuments({
  executionType: 'REBOUND',
});

print(`Total: ${total}`);
print(`DIRECT: ${direct} (${((direct / total) * 100).toFixed(2)}%)`);
print(`REBOUND: ${rebound} (${((rebound / total) * 100).toFixed(2)}%)`);
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Módulo `trading-simulator`:

- [ ] Schema MongoDB con campos exactos
- [ ] Lógica de trailing LONG
- [ ] Lógica de trailing SHORT
- [ ] Cuantización de precios con `tickSize`
- [ ] Detección de `executionType` (DIRECT/REBOUND)
- [ ] `markModified('trailingLevels')` para guardar en DB
- [ ] Tests unitarios para casos de prueba

### Módulo `tests`:

- [ ] WebSocket connection a ETH futures 15m
- [ ] Crear simulación al cerrar vela
- [ ] Actualizar simulaciones activas en tiempo real
- [ ] Logs claros de eventos
- [ ] Endpoint para ver estadísticas

### Verificación:

- [ ] Compilar sin errores
- [ ] Ver logs de simulaciones creadas
- [ ] Ver logs de `executionPrice` actualizándose
- [ ] Ver logs de FILLED con tipo correcto
- [ ] Verificar en MongoDB que se guardan correctamente
- [ ] Ejecutar casos de prueba 1, 2 y 3

---

## 🎯 RESULTADO ESPERADO

Después de 24-48 horas de pruebas con ETH:

```
Total simulaciones: 100
DIRECT: 65 (65%)
REBOUND: 35 (35%)

Conclusión: Las señales tienden a subir directamente.
Estrategia recomendada: Entrar inmediatamente al ver la señal.
```

O

```
Total simulaciones: 100
DIRECT: 30 (30%)
REBOUND: 70 (70%)

Conclusión: Las señales tienden a hacer rebote.
Estrategia recomendada: Esperar el rebote para mejor entrada.
```

---

## 🚨 ERRORES COMUNES A EVITAR

### ❌ Error 1: `executionPrice` baja por centavos

**Causa:** No verificar el umbral correcto
**Solución:** `if (currentPrice <= executionPrice * (1 - callbackRate))`

### ❌ Error 2: No se guarda en DB

**Causa:** Olvidar `markModified('trailingLevels')`
**Solución:** Siempre usar `sim.markModified('trailingLevels')` antes de `sim.save()`

### ❌ Error 3: `executionType` mal clasificado

**Causa:** Comparar con `executionPrice` en lugar de `p0`
**Solución:** `if (fillPrice >= p0 * (1 + callbackRate))` para DIRECT

### ❌ Error 4: Simulaciones no se actualizan

**Causa:** No llamar `updatePrice` en cada tick
**Solución:** Actualizar en el evento `message` del WebSocket (incluso cuando vela NO está cerrada)

---

## 📝 NOTAS FINALES

1. **NO TOCAR `BinanceWebSocketGateway`** hasta confirmar que el trailing funciona
2. **Probar con ETH primero** porque tiene buen volumen y liquidez
3. **Dejar correr 24-48 horas** para tener datos significativos
4. **Revisar logs constantemente** para detectar problemas temprano
5. **Guardar todo en MongoDB** para análisis posterior

---

## 🤝 SIGUIENTE PASO

**MAÑANA:**

1. Revisar este README completo
2. Confirmar que la lógica es correcta
3. Implementar paso por paso
4. Probar con casos de prueba 1, 2 y 3
5. Dejar corriendo para recolectar datos

**Si todo funciona:**

- Aplicar a señales reales PinVol
- Recolectar estadísticas DIRECT vs REBOUND
- Ajustar estrategia de entrada

---

**¡BUENAS NOCHES, HERMANO! 💤**
**Mañana revisamos y empezamos de nuevo con todo claro.**
