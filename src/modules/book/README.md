# 📖 Book Module - Order Book Capture

## Descripción

Módulo **aislado** para capturar el Order Book profundo de Binance en tiempo real y guardarlo en Redis.

### Características v1

- ✅ WebSocket: `depth20@100ms` (20 niveles, actualización cada 100ms)
- ✅ Symbol: **ETHUSDT** (por ahora)
- ✅ Storage: **Redis** con TTL de 60 segundos
- ✅ Métricas pre-calculadas: spread, imbalance, mid price
- ✅ Logging cada 100 ticks (~10 segundos)

---

## Arquitectura

```
BookModule (AISLADO - No toca otros módulos)
  │
  ├─ BookService
  │   ├─ WebSocket → wss://stream.binance.com:9443/ws/ethusdt@depth20@100ms
  │   ├─ Procesamiento → buildSnapshot()
  │   └─ Storage → Redis (key: book:ETHUSDT, TTL: 60s)
  │
  └─ Types
      └─ book.types.ts (BinanceDepthSnapshot, BookSnapshot, etc.)
```

---

## Flujo de Datos

```mermaid
graph LR
    A[Binance WS] -->|depth20@100ms| B[BookService]
    B -->|Parse & Enrich| C[BookSnapshot]
    C -->|JSON| D[Redis]
    D -->|TTL 60s| D
    E[Otros Módulos] -.->|getLatestSnapshot| B
    B -.->|Read| D
```

---

## Estructura de Datos

### Redis Key
```
book:ETHUSDT
```

### BookSnapshot (JSON)
```typescript
{
  symbol: "ETHUSDT",
  timestamp: 1697123456789,
  lastUpdateId: 12345678,
  
  bids: [
    { price: "1850.50", qty: "10.5" },
    { price: "1850.45", qty: "5.2" },
    // ... 18 niveles más
  ],
  
  asks: [
    { price: "1850.55", qty: "8.3" },
    { price: "1850.60", qty: "12.1" },
    // ... 18 niveles más
  ],
  
  // Métricas pre-calculadas
  spread: 0.05,
  spreadPct: 0.0027,
  midPrice: 1850.525,
  totalBidQty: 150.5,
  totalAskQty: 145.2,
  imbalance: 0.0179  // (bid - ask) / (bid + ask)
}
```

---

## Uso

### Obtener último snapshot

```typescript
import { BookService } from './modules/book/book.service';

@Injectable()
export class MiServicio {
  constructor(private readonly bookService: BookService) {}
  
  async analizarBook() {
    const snapshot = await this.bookService.getLatestSnapshot();
    
    if (snapshot) {
      console.log(`Mid Price: $${snapshot.midPrice}`);
      console.log(`Spread: ${snapshot.spreadPct}%`);
      console.log(`Imbalance: ${snapshot.imbalance * 100}%`);
    }
  }
}
```

### Ver estadísticas

```typescript
const stats = this.bookService.getStats();
console.log(stats);
// {
//   symbol: 'ETHUSDT',
//   tickCount: 1234,
//   uptimeSeconds: 123.4,
//   ticksPerSecond: 10.0,
//   connected: true
// }
```

---

## Logs Esperados

```
[BookService] 📖 Iniciando BookService para ETHUSDT...
[BookService] ✅ WebSocket conectado: wss://stream.binance.com:9443/ws/ethusdt@depth20@100ms
[BookService] 🎯 Capturando order book depth20 para ETHUSDT cada 100ms

[BookService] 📊 ETHUSDT | Ticks: 100 (10.0/s) | Mid: $1850.52 | Spread: 0.0027% | Imb: 1.79% | Levels: 20/20
[BookService] 📊 ETHUSDT | Ticks: 200 (10.0/s) | Mid: $1851.30 | Spread: 0.0025% | Imb: -0.45% | Levels: 20/20
```

---

## Próximas Iteraciones

### v1.1: Más Símbolos
- [ ] Soportar múltiples pares (BTC, SOL, etc.)
- [ ] Configuración dinámica de símbolos

### v1.2: Métricas Avanzadas
- [ ] Whale detection (órdenes > threshold)
- [ ] Support/Resistance levels
- [ ] VWAP of the book
- [ ] Order flow delta

### v1.3: Integración
- [ ] Trigger cuando vela 15m cierra
- [ ] Guardar snapshot en MongoDB junto a análisis
- [ ] Usar en predicciones

---

## Testing

```bash
# Compilar
npm run build

# Ejecutar en dev
npm run dev

# Ver logs del WebSocket
tail -f logs/combined.log | grep BookService

# Verificar Redis
redis-cli GET "book:ETHUSDT"
```

---

## Notas Técnicas

- **Frecuencia**: ~10 ticks/segundo (100ms interval)
- **Latencia**: Binance WS tiene latency < 50ms típicamente
- **Throughput Redis**: ~10 writes/segundo (trivial para Redis)
- **Memoria Redis**: ~5KB por snapshot × TTL 60s = ~5KB estable
- **Reconexión**: Automática cada 5s si se cae




