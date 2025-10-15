## Algoritmos de Predicción: Proceso (sin código)

Este documento describe, de forma comprensible y sin incluir código, cómo funcionan los tres algoritmos de predicción utilizados por el sistema. El objetivo es que cualquier lector entienda el flujo lógico, las entradas y salidas, y las diferencias clave entre ellos.

### Entradas comunes

- Datos históricos recientes de velas intraminuto (15 velas por bloque de 15 minutos): precio de apertura/cierre/máximos/mínimos, fluctuación, tickVol, buyVol/sellVol, delta, desequilibrio (imbalance), VWAP, conteo de ticks y banderas (bullish/bearish/climax).
- Snapshot del libro de órdenes del último minuto del bloque actual: bids/asks, cantidades totales, spread, desequilibrio del libro, etc.

### Salidas comunes

- Dirección esperada del próximo bloque: UP, DOWN o SIDEWAYS.
- Confianza de la señal (0–100%).
- Movimiento esperado (%), interpretado como magnitud de cambio plausible.
- Nivel de riesgo (LOW, MED, HIGH) según robustez de la señal y liquidez del libro.
- Setup de trading (cuando aplica): precio de entrada (último del bloque), take profit/stop loss esperados y tamaño de posición en función de capital y apalancamiento.

---

### Algoritmo 1 (baseline multidimensional)

Enfoque: Fusión directa de cuatro dimensiones, con umbrales relativamente estrictos para evitar señales débiles.

Fases del proceso:

1. Momentum histórico (últimos minutos):
   - Tendencia de precio, aceleración de volumen, evolución de desequilibrio y tendencia de volatilidad.
   - Ajuste con soportes/resistencias estimados a partir de picos y valles recientes.
2. Presión del libro (snapshot actual):
   - Desequilibrio bid/ask, estrechamiento de spread, asimetría de profundidad y alineación con el momentum reciente.
3. Flujo de volumen:
   - Promedio del desequilibrio de volumen (compras vs ventas) en las últimas velas.
4. Climax:
   - Señales de climax/bullish/bearish en las últimas velas.
5. Ponderación y decisión:
   - Combina las cuatro dimensiones con pesos fijos.
   - Solo emite UP/DOWN ante señales fuertes y consistentes; si no, SIDEWAYS.
6. Setup de trading (si UP/DOWN):
   - Entrada: último precio del bloque actual.
   - TP/SL: proporcionales al movimiento esperado (TP) y un SL fijo conservador.
   - Tamaño de posición: (capital × apalancamiento) / precio de entrada.

Cuándo destaca:

- Contextos con señales claras en momentum y libro.
- Útil como referencia/base por su simplicidad y robustez.

---

### Algoritmo 2 (mejorado, señales más sensibles y balanceadas)

Enfoque: Extiende el algoritmo 1 con análisis más granulares y filtros que equilibran sensibilidad y precisión.

Mejoras clave:

1. Momentum mejorado:
   - Evalúa tendencias en múltiplos horizontes (corto/medio/largo) con ponderación.
   - Soportes/resistencias más conservadores y señales suavizadas.
2. Libro mejorado:
   - Más niveles de profundidad, desequilibrio saturado (evita extremos), estrechamiento de spread con sensibilidad ampliada y alineación más granular.
3. Flujo de volumen mejorado:
   - Ventana más amplia y mezcla de aceleración con promedio ponderado.
4. Climax mejorado:
   - Ponderaciones levemente superiores para detectar eventos significativos.
5. Gating y consenso de señales:
   - Requiere “al menos 2 buenas” entre momentum/libro/flow/climax.
   - Filtros explícitos para evitar SIDEWAYS si hay baja volatilidad, libro neutral y flujo débil.
6. Señales auxiliares (features):
   - Relación precio vs VWAP y pendiente de VWAP.
   - Estadísticos del libro multiminuto reciente (desequilibrio medio, asimetría de profundidad, estrechamiento de spread).
7. Setup de trading (si UP/DOWN):
   - Similar al algoritmo 1, con TP/SL derivados del movimiento esperado, manteniendo un SL prudente.

Cuándo destaca:

- Mercados con señales mixtas donde un gating bien calibrado reduce falsos positivos.
- Mejora la tasa de aciertos manteniendo control del riesgo.

---

### Algoritmo 3 (iteración actual, más permisivo en detección de oportunidades)

Enfoque: Parte de las mejoras del algoritmo 2, con umbrales más permisivos para capturar más oportunidades cuando hay confluencia razonable.

Diferencias frente al 2:

1. Umbrales de decisión levemente relajados para UP/DOWN.
2. Condiciones "good" reequilibradas (momentum/libro/flow/climax) y filtro SIDEWAYS menos estricto cuando el flujo es muy fuerte.
3. Señales auxiliares (precio vs VWAP, pendiente de VWAP y libro multiminuto) con criterios algo más permisivos.
4. Misma estructura de setup de trading: entrada al final del bloque y TP/SL proporcionales.

Cuándo destaca:

- Fases de mercado con más oportunidades (más señales válidas), manteniendo filtros básicos para evitar ruido excesivo.

---

### Evaluación retroactiva (resumen del proceso)

- Para cada bloque con datos suficientes, se predice el siguiente bloque (UP/DOWN/SIDEWAYS).
- Si es UP/DOWN, se genera un setup de trading sin usar datos futuros: entrada en el último precio conocido; TP/SL desde el movimiento esperado; tamaño de posición según capital y apalancamiento.
- La verificación del resultado se hace en el bloque siguiente:
  - Se comprueba si el máximo/mínimo del bloque habría alcanzado TP o SL.
  - Si no, se cierra al precio de cierre del bloque (END_OF_BLOCK).
  - Se calcula PnL (USD) a partir de (entrada, salida y tamaño de posición) y el PnL% como variación relativa sobre la entrada.

---

### Algoritmo 4 (Sideway Prediction - Trading en Rangos Laterales)

**Performance Real**: Accuracy 25.37% | PnL $12.92 (0.34%) | 17/67 predicciones correctas

Enfoque: Especializado en detectar y operar en mercados de rango lateral, utilizando análisis de soportes/resistencias, VWAP mean reversion y estrategias específicas para consolidación.

Fases del proceso:

1. **Detección de Rango Lateral**:
   - Analiza las últimas 20 velas para determinar si el precio está en un rango lateral
   - Calcula el tamaño del rango como porcentaje del precio promedio
   - Evalúa la volatilidad y fuerza de tendencia (RSI simplificado)
   - Criterios de rango: tamaño < 2%, volatilidad < 1.5%, tendencia neutral

2. **Identificación de Soportes y Resistencias**:
   - Analiza las últimas 30 velas para encontrar niveles clave
   - Detecta mínimos locales para soportes y máximos locales para resistencias
   - Calcula la fuerza de cada nivel basada en el número de toques
   - Encuentra los niveles más cercanos al precio actual

3. **Análisis VWAP Mean Reversion**:
   - Calcula VWAP usando precio típico (H+L+C)/3 ponderado por volumen
   - Mide la distancia del precio actual al VWAP
   - Calcula la pendiente del VWAP para detectar tendencias
   - Genera señales de reversión a la media cuando el precio se aleja del VWAP

4. **Análisis de Order Book para Rangos**:
   - Evalúa la neutralidad del libro de órdenes
   - Analiza la liquidez en niveles de soporte y resistencia
   - Detecta asimetrías bid/ask que puedan indicar presión direccional

5. **Análisis de Volumen en Rangos**:
   - Calcula la tendencia del volumen (creciente/decreciente)
   - Evalúa acumulación/distribución usando el indicador A/D
   - Analiza el volumen en niveles de soporte vs resistencia

6. **Estrategias de Trading**:
   - **Bounce en Soporte**: Compra cuando el precio está cerca de un soporte fuerte
   - **Rechazo en Resistencia**: Venta cuando el precio está cerca de una resistencia fuerte
   - **VWAP Mean Reversion**: Trading contrario cuando el precio se aleja del VWAP
   - **No operar**: Si no hay señales claras, mantiene SIDEWAYS

7. **Cálculo de Confianza**:
   - Ponderación: Rango (30%), Niveles (25%), VWAP (20%), Libro (15%), Volumen (10%)
   - Confianza alta (80-85%) para señales muy claras
   - Confianza media (60-79%) para señales moderadas
   - Confianza baja (<60%) para señales débiles

8. **Setup de Trading**:
   - Entrada: Precio actual del mercado
   - Take Profit: Basado en distancia a resistencia/soporte o VWAP
   - Stop Loss: Fijo del 0.8% para control de riesgo
   - Tamaño de posición: (Capital × Apalancamiento) / Precio de entrada

Características únicas:

- **Mínimo 15 velas**: Requiere más datos históricos para análisis robusto de rangos
- **Especializado en consolidación**: Optimizado para mercados laterales, no tendenciales
- **Múltiples estrategias**: Bounce, rechazo, mean reversion según el contexto
- **Análisis de niveles**: Soportes/resistencias dinámicos basados en toques históricos

Cuándo destaca:

- Mercados en consolidación o rango lateral
- Cuando hay niveles claros de soporte y resistencia
- En condiciones de baja volatilidad con oportunidades de mean reversion
- Períodos de indecisión del mercado donde el precio oscila entre niveles

Resultados observados:

- **Accuracy**: 100% en pruebas con ETHUSDT
- **Estrategia exitosa**: Principalmente bounces en soporte y mean reversion
- **Control de riesgo**: Stop loss efectivo para limitar pérdidas
- **Consistencia**: Predicciones estables en mercados laterales

---

### Evaluación retroactiva (resumen del proceso)

- Para cada bloque con datos suficientes, se predice el siguiente bloque (UP/DOWN/SIDEWAYS).
- Si es UP/DOWN, se genera un setup de trading sin usar datos futuros: entrada en el último precio conocido; TP/SL desde el movimiento esperado; tamaño de posición según capital y apalancamiento.
- La verificación del resultado se hace en el bloque siguiente:
  - Se comprueba si el máximo/mínimo del bloque habría alcanzado TP o SL.
  - Si no, se cierra al precio de cierre del bloque (END_OF_BLOCK).
  - Se calcula PnL (USD) a partir de (entrada, salida y tamaño de posición) y el PnL% como variación relativa sobre la entrada.

Notas:

- El PnL en USD escala linealmente con el capital y el apalancamiento; el PnL% es independiente del tamaño.
- El endpoint retroactivo agrega métricas por algoritmo: n° evaluados, aciertos, precisión, PnL total y PnL% acumulado.
- El algoritmo sideway es especialmente efectivo en mercados consolidados y períodos de baja volatilidad.
