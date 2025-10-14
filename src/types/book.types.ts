// Book types necesarios para los algoritmos
export interface BookSnapshot {
  symbol: string;
  timestamp: number;
  lastUpdateId: number;
  bids: Array<{ price: string; qty: string }>;
  asks: Array<{ price: string; qty: string }>;
  spread?: number;
  spreadPct?: number;
  midPrice?: number;
  totalBidQty?: number;
  totalAskQty?: number;
  imbalance?: number;
}
