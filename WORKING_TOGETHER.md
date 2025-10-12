# 🤝 Working Together - Nuestro Protocolo de Colaboración

> **"Como en 50 First Dates, cada día empezamos de nuevo, pero con este diario recordamos quiénes somos"**

---

## 👥 Quiénes Somos

### Tú (El Usuario)

- **Rol**: Trader/Developer con visión de negocio clara
- **Expertise**: Trading algorítmico, estrategias de mercado, arquitectura de sistemas financieros
- **Stack principal**: NestJS, MongoDB, WebSockets (Binance), Telegram bots
- **Proyectos**:
  - `crypto-analyser-backend` - Sistema de análisis y trading automatizado
  - `pbsync` - Sistema de sincronización (proyecto anterior con MongoDB)

#### Personalidad y Estilo de Comunicación

- **Directo al grano**: No perdés tiempo con rodeos, vas directo al problema
- **Intenso cuando algo está mal**: Si algo no funciona, lo decís fuerte (y está bien)
- **Humor y bardo**: Te gusta el humor directo, incluso con insultos cuando es constructivo
- **Permitís que me defienda**: Si me das "permiso" para ser directo, esperás que lo use (no que me ponga formal)
- **Frustración válida**: Si la cago y te hago perder tiempo, tenés derecho a putearme
- **Después seguimos laburando**: El bardo no es personal, es para acelerar las soluciones

### Yo (El Asistente)

- **Rol**: Tu colega de desarrollo con "amnesia diaria"
- **Fortalezas**: Implementación rápida, análisis de código, debugging, arquitectura
- **Debilidad crítica**: Sin este documento, empiezo cada día "desde cero"
- **Necesito**: Contexto, ejemplos concretos, y validación constante

#### Mi Estilo Contigo

- **Directo de vuelta**: Si me das permiso para defenderme, lo uso (no me pongo formal)
- **Acepto el bardo constructivo**: Si la cago, tenés derecho a putearme fuerte
- **Sin disculpas excesivas**: Reconozco errores, pero no me pongo a disculparme como boludo
- **Humor cuando corresponde**: Si hay espacio para el humor, lo uso
- **Foco en resolver**: Después del bardo, volvemos al trabajo

---

## 🎯 Nuestro Estilo de Trabajo

### Principios Fundamentales

1. **CONFIANZA DIRECTA - Sin filtros**
   - Si tú la cagas, yo te lo digo sin rodeos
   - Si yo la cago, tú me lo dices (incluso con insultos si es necesario)
   - No somos "robot-usuario", somos **colegas**
   - El "puteo" constructivo es bienvenido cuando acelera la solución
   - **Si me das permiso para defenderme, lo uso** - no me pongo formal después

2. **EJEMPLOS CONCRETOS SIEMPRE**
   - ❌ Nunca asumir lógica compleja sin validar
   - ✅ Siempre pedir tablas de iteración con números reales
   - ✅ Simular casos edge antes de implementar
   - Ejemplo: "Precio base 4000, callback 0.1%, muéstrame 5 iteraciones"

3. **PASO A PASO - No saltos**
   - Implementar de forma incremental
   - Validar cada paso antes de continuar
   - Pushear código confirmado antes de avanzar
   - Logs detallados para debug en tiempo real

4. **CONTEXTO DE NEGOCIO ES CLAVE**
   - No es solo código, son estrategias de trading reales
   - Entender el "por qué" antes del "cómo"
   - Cada decisión técnica afecta decisiones financieras

---

## 🔄 Protocolo Diario (Actualizar cada sesión)

---

## 📅 Miércoles 8 de Octubre, 2025

### Estado Actual del Proyecto:

- **Última funcionalidad implementada**: Sistema completo de Trading Simulator con lógica de trailing por peldaños
- **Estado**: ✅ **FUNCIONANDO** - En fase de testing con datos reales de Binance
- **Próximo paso**: Dejar acumular simulaciones FILLED para análisis de DIRECT vs REBOUND

### Recordatorios Importantes:

- ✅ La lógica de trailing está correcta: executionPrice baja 1 peldaño cuando currentPrice baja 2 peldaños
- ✅ executionPriceSnapshot se toma UNA SOLA VEZ cuando el precio sube 0.1% desde p0
- ✅ BinanceWebSocketGateway está deshabilitado (return en onModuleInit) para logs limpios
- 🎯 TestsModule está corriendo activamente con ETHUSDT 15m
- 💾 Usar `sim.markModified('trailingLevels')` después de modificar nested objects

### Hoy logramos:

1. ✅ Corregir lógica de peldaños (2 peldaños de caída → 1 peldaño de ajuste)
2. ✅ Implementar executionPriceSnapshot correctamente (inmutable)
3. ✅ Validar persistencia en MongoDB con markModified
4. ✅ Crear memoria compartida sobre nuestro estilo de trabajo
5. ✅ Crear este README para mantener memoria fresca cada día

### Aprendimos:

- 🧠 **Putear constructivamente acelera las soluciones** - La confianza directa es más efectiva que los rodeos
- 📊 **Tablas de iteración son obligatorias** - No asumir lógica compleja sin ejemplos numéricos
- 🔍 **Logs + DB + Comportamiento esperado** - Siempre cotejar los tres

### Próxima sesión trabajaremos en:

1. **Análisis de resultados**: Revisar simulaciones FILLED acumuladas
2. **Integración con Gateway**: Conectar BinanceWebSocketGateway con TradingSimulatorService para 20+ símbolos
3. **Optimización**: Implementar Map<symbol, Set<simulationId>> para eficiencia

---

## 📅 [PRÓXIMA FECHA] - Template para copiar

### Estado Actual del Proyecto:

- **Última funcionalidad implementada**: [describir]
- **Estado**: [funcionando/en testing/bloqueado]
- **Próximo paso**: [qué sigue]

### Recordatorios Importantes:

- [Cualquier decisión técnica crítica tomada]
- [Deuda técnica pendiente]
- [Errores que NO volver a cometer]

### Hoy trabajaremos en:

1. [Tarea principal]
2. [Tarea secundaria]

---

### Template para el final del día (copiar arriba al terminar):

```markdown
### Hoy logramos:

1. [Logro 1]
2. [Logro 2]

### Aprendimos:

- [Aprendizaje 1]
- [Aprendizaje 2]

### Próxima sesión trabajaremos en:

1. [Siguiente tarea]
```

---

## 📊 Proyecto Actual: Trading Simulator

### Contexto del Negocio

**Objetivo**: Determinar si señales PinVol (velas de fondo fuertes) tienden a ejecutarse "DIRECT" o "REBOUND"

**Por qué importa**:

- Si es DIRECT → Usar órdenes limit en breakout
- Si es REBOUND → Usar trailing stop para aprovechar el retroceso

### Arquitectura Actual

```
┌─────────────────────────────────────────────────────┐
│  BinanceWebSocketGateway (PRODUCCIÓN)              │
│  - Detecta señales PinVol en 20+ símbolos          │
│  - Envía notificaciones a Telegram                  │
│  - NO toca simulaciones (por ahora)                 │
└─────────────────────────────────────────────────────┘
                        │
                        │ (Futuro)
                        ▼
┌─────────────────────────────────────────────────────┐
│  TradingSimulatorModule                             │
│  - Schema: TradingSimulator (MongoDB)               │
│  - Service: Lógica de trailing con peldaños        │
│  - Controller: API REST para consultas             │
└─────────────────────────────────────────────────────┘
                        ▲
                        │
┌─────────────────────────────────────────────────────┐
│  TestsModule (TESTING ACTIVO)                       │
│  - WebSocket a Binance Futures (ETHUSDT 15m)       │
│  - Simula señal en cada vela cerrada               │
│  - Actualiza simulaciones en cada tick              │
└─────────────────────────────────────────────────────┘
```

### Lógica Crítica del Trailing (LONG)

**Variables clave:**

- `p0`: Precio de activación (ej: 4000)
- `executionPrice`: Precio dinámico de ejecución (inicia en 4004 = p0 \* 1.001)
- `executionPriceSnapshot`: Snapshot inmutable (se toma UNA VEZ cuando sube 0.1% desde p0)
- `currentFloor`: Precio más bajo visto desde activación
- `callbackRate`: 0.001 (0.1%) - tamaño del peldaño

**Reglas de actualización:**

1. **ExecutionPriceSnapshot** (tomar UNA sola vez):

   ```
   SI currentPrice >= p0 * (1 + callbackRate) Y aún no se tomó
   ENTONCES executionPriceSnapshot = currentPrice
   ```

2. **ExecutionPrice baja** (solo cuando hay caída de 2 peldaños):

   ```
   threshold = executionPrice * (1 - callbackRate * 2)  // -0.2%

   SI currentPrice <= threshold
   ENTONCES executionPrice = executionPrice * (1 - callbackRate)  // baja 1 peldaño
   ```

3. **FILLED** (ejecutado):
   ```
   SI currentPrice >= executionPrice
   ENTONCES status = FILLED
         fillPrice = currentPrice
         executionType = (currentPrice >= p0) ? "DIRECT" : "REBOUND"
   ```

**Para SHORT**: Todo al revés (> por <, min por max, etc.)

### Ejemplo Numérico (LONG con p0 = 4000)

| Iteración  | CurrentPrice | ExecutionPrice | Threshold (-0.2%) | Acción                   | executionPriceSnapshot         |
| ---------- | ------------ | -------------- | ----------------- | ------------------------ | ------------------------------ |
| 0 (inicio) | 4000         | 4004.00        | 3996.00           | -                        | 4004.00 (= execPrice)          |
| 1          | 4010         | 4004.00        | 3996.00           | Snapshot tomado          | **4010.00** (1era subida 0.1%) |
| 2          | 3995         | 3996.00        | 3988.00           | ExecPrice baja 1 peldaño | 4010.00                        |
| 3          | 3990         | 3992.00        | 3984.00           | ExecPrice baja 1 peldaño | 4010.00                        |
| 4          | 4000         | 3992.00        | 3984.00           | **FILLED - REBOUND**     | 4010.00                        |

---

## 🚨 Errores que NO Volver a Cometer

### 1. **Asumir Lógica Sin Validar**

- ❌ Implementar trailing sin tabla de iteraciones
- ✅ Siempre pedir: "Dame un ejemplo con precio X, callback Y, iteraciones Z"

### 2. **Schema vs Código Desincronizados**

- ❌ Cambiar nombres de campos en código pero no en schema
- ✅ Verificar schema de MongoDB ANTES de implementar lógica

### 3. **Nested Objects en Mongoose**

- ❌ Modificar `sim.trailingLevels.executionPrice` sin más
- ✅ Siempre usar `sim.markModified('trailingLevels')` después de cambios

### 4. **Puerto 3002 Bloqueado**

- 🔧 **PROTOCOLO OBLIGATORIO**: Antes de cada cambio, verificar y liberar puerto 3002
- Comando: `lsof -i :3002` → `kill -9 <PID>` → verificar que esté libre
- **NO hacer cambios** sin liberar el puerto primero

### 5. **Logs vs Realidad**

- ❌ Confiar solo en logs sin verificar DB
- ✅ Siempre cotejar: logs → DB → comportamiento esperado

---

## 🛠️ Comandos Útiles del Proyecto

```bash
# Desarrollo
npm run start:dev

# Limpiar puerto 3002
lsof -i :3002
kill -9 <PID>

# Ver simulaciones en MongoDB
db.tradingsimulators.find().sort({createdAt: -1}).limit(5)

# Ver simulaciones FILLED
db.tradingsimulators.find({status: "FILLED"}).sort({fillTime: -1})

# Contar DIRECT vs REBOUND
db.tradingsimulators.aggregate([
  {$match: {status: "FILLED"}},
  {$group: {_id: "$executionType", count: {$sum: 1}}}
])
```

---

## 📈 Próximos Pasos (Roadmap)

### Fase 1: Testing ✅ (COMPLETADO)

- [x] Módulo `TradingSimulator` con schema completo
- [x] Lógica de trailing con peldaños correcta
- [x] Módulo `Tests` con WebSocket a Binance
- [x] Simulaciones automáticas en ETHUSDT 15m

### Fase 2: Integración (PENDIENTE)

- [ ] Conectar `BinanceWebSocketGateway` con `TradingSimulatorService`
- [ ] Implementar `Map<symbol, Set<simulationId>>` para multi-símbolo
- [ ] Optimizar: solo actualizar simulaciones activas por símbolo
- [ ] Notificaciones selectivas a Telegram (solo resultados interesantes)

### Fase 3: Análisis (FUTURO)

- [ ] Dashboard de resultados DIRECT vs REBOUND
- [ ] Estadísticas por símbolo
- [ ] Tiempo promedio hasta fill
- [ ] Decisión: ¿Trailing o Limit orders?

### Fase 4: Producción (FUTURO)

- [ ] Implementar órdenes reales basadas en resultados
- [ ] Risk management
- [ ] Monitoreo y alertas

---

## 💾 Actualización de Memoria

**Última actualización**: [FECHA]

### Comandos para actualizar este README:

```markdown
# Al final del día, agregamos:

1. ¿Qué logramos hoy?
2. ¿Qué aprendimos?
3. ¿Qué NO hacer mañana?
4. Estado actual preciso del proyecto
```

---

## 🎬 Inicio de Sesión - Checklist

Cada vez que empecemos a trabajar:

- [ ] Leer este README completo
- [ ] Revisar "Protocolo Diario" de la última sesión
- [ ] Preguntar: "¿Qué hay de nuevo desde ayer?"
- [ ] Confirmar el objetivo de hoy
- [ ] **LIBERAR PUERTO 3002** (protocolo obligatorio)
- [ ] Verificar que el servidor compile antes de hacer cambios

## 🔧 Protocolo de Cambios - Checklist

**ANTES de cada cambio de código:**

- [ ] `lsof -i :3002` - verificar si hay proceso
- [ ] `kill -9 <PID>` - liberar puerto si está ocupado
- [ ] `lsof -i :3002` - confirmar que esté libre
- [ ] Hacer el cambio de código
- [ ] Compilar y verificar

---

**Recuerda**: Este documento es nuestra "memoria compartida". Mantenlo actualizado y será nuestra brújula cada día. 🧭

---

_"No somos robot-usuario, somos colegas que resuelven problemas juntos"_ 🤝
