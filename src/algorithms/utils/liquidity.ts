/**
 * Liquidity analysis utilities for SAVP algorithm
 */

export interface BookLevel {
  price: number;
  qty: number;
}

export interface BookSnapshot {
  bids: BookLevel[];
  asks: BookLevel[];
}

/**
 * Aggregate wall size at given price levels
 */
export function aggregateWall(
  book: BookSnapshot, 
  side: 'bid' | 'ask', 
  ticksRange: number
): { price: number; qty: number }[] {
  const levels = side === 'bid' ? book.bids : book.asks;
  if (levels.length === 0) return [];
  
  const walls = [];
  let currentPrice = levels[0].price;
  let totalQty = 0;
  
  for (const level of levels) {
    const priceDiff = Math.abs(level.price - currentPrice);
    if (priceDiff <= ticksRange) {
      totalQty += level.qty;
    } else {
      if (totalQty > 0) {
        walls.push({ price: currentPrice, qty: totalQty });
      }
      currentPrice = level.price;
      totalQty = level.qty;
    }
  }
  
  if (totalQty > 0) {
    walls.push({ price: currentPrice, qty: totalQty });
  }
  
  return walls;
}

/**
 * Check for stacking behavior (increasing quantity without price advancement)
 */
export function hasStacking(
  prevBook: BookSnapshot, 
  nextBook: BookSnapshot, 
  side: 'bid' | 'ask', 
  minSteps: number = 2
): boolean {
  const prevLevels = side === 'bid' ? prevBook.bids : prevBook.asks;
  const nextLevels = side === 'bid' ? nextBook.bids : nextBook.asks;
  
  if (prevLevels.length === 0 || nextLevels.length === 0) return false;
  
  const prevTotalQty = prevLevels.reduce((sum, level) => sum + level.qty, 0);
  const nextTotalQty = nextLevels.reduce((sum, level) => sum + level.qty, 0);
  
  if (nextTotalQty <= prevTotalQty) return false;
  
  // Check if price didn't advance significantly
  const prevBestPrice = side === 'bid' ? prevLevels[0].price : prevLevels[0].price;
  const nextBestPrice = side === 'bid' ? nextLevels[0].price : nextLevels[0].price;
  
  const priceAdvancement = side === 'bid' 
    ? nextBestPrice - prevBestPrice 
    : prevBestPrice - nextBestPrice;
  
  return priceAdvancement <= minSteps;
}

/**
 * Calculate order book imbalance (-1 to 1)
 */
export function orderbookImbalance(book: BookSnapshot): number {
  if (book.bids.length === 0 || book.asks.length === 0) return 0;
  
  const bidQty = book.bids.reduce((sum, level) => sum + level.qty, 0);
  const askQty = book.asks.reduce((sum, level) => sum + level.qty, 0);
  const totalQty = bidQty + askQty;
  
  if (totalQty === 0) return 0;
  
  return (bidQty - askQty) / totalQty;
}

/**
 * Calculate spread percentage
 */
export function calculateSpreadPercent(book: BookSnapshot): number {
  if (book.bids.length === 0 || book.asks.length === 0) return 0;
  
  const bestBid = book.bids[0].price;
  const bestAsk = book.asks[0].price;
  const midPrice = (bestBid + bestAsk) / 2;
  
  return ((bestAsk - bestBid) / midPrice) * 100;
}

/**
 * Find support/resistance levels within price range
 */
export function findSupportResistance(
  books: BookSnapshot[], 
  priceRange: number, 
  minWallSize: number
): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  for (const book of books) {
    const bidWalls = aggregateWall(book, 'bid', 2);
    const askWalls = aggregateWall(book, 'ask', 2);
    
    for (const wall of bidWalls) {
      if (wall.qty >= minWallSize) {
        support.push(wall.price);
      }
    }
    
    for (const wall of askWalls) {
      if (wall.qty >= minWallSize) {
        resistance.push(wall.price);
      }
    }
  }
  
  return { support, resistance };
}
