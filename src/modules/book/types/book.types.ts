/**
 * Order Book Types - Binance Depth Stream
 * 
 * Basado en: https://binance-docs.github.io/apidocs/spot/en/#partial-book-depth-streams
 * Stream: <symbol>@depth<levels>@<update_speed>
 * Ejemplo: ethusdt@depth20@100ms
 */

/**
 * Nivel individual del order book (bid o ask)
 */
export interface BookLevel {
  price: string;  // Precio como string (precisión exacta)
  qty: string;    // Cantidad como string (precisión exacta)
}

/**
 * Snapshot completo del order book desde Binance WebSocket
 */
export interface BinanceDepthSnapshot {
  lastUpdateId: number;  // ID de la última actualización
  bids: BookLevel[];     // Bids ordenados por precio DESC [mejor bid primero]
  asks: BookLevel[];     // Asks ordenados por precio ASC [mejor ask primero]
}

/**
 * Payload del WebSocket depth stream
 */
export interface DepthStreamPayload {
  e: string;              // Event type: "depthUpdate"
  E: number;              // Event time (timestamp)
  s: string;              // Symbol (ej: "ETHUSDT")
  U: number;              // First update ID in event
  u: number;              // Final update ID in event
  b: [string, string][];  // Bids to be updated [price, qty]
  a: [string, string][];  // Asks to be updated [price, qty]
}

/**
 * Estructura enriquecida para almacenar en Redis
 */
export interface BookSnapshot {
  symbol: string;
  timestamp: number;          // Timestamp de captura (ms)
  lastUpdateId: number;
  bids: BookLevel[];
  asks: BookLevel[];
  
  // Métricas pre-calculadas (opcional para v1)
  spread?: number;            // ask[0] - bid[0]
  spreadPct?: number;         // spread / mid * 100
  midPrice?: number;          // (bid[0] + ask[0]) / 2
  totalBidQty?: number;       // Suma de cantidades en bids
  totalAskQty?: number;       // Suma de cantidades en asks
  imbalance?: number;         // (bidQty - askQty) / (bidQty + askQty)
}




