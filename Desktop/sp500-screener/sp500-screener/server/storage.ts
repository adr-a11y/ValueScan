// In-memory cache for stock screener data
import type { Stock, ScreenerResult } from "@shared/schema";

export interface IStorage {
  getCachedScreener(): ScreenerResult | null;
  setCachedScreener(data: ScreenerResult): void;
  getCacheAge(): number; // seconds since last update
}

export class MemStorage implements IStorage {
  private screenerCache: ScreenerResult | null = null;
  private cacheTimestamp: number = 0;

  getCachedScreener(): ScreenerResult | null {
    return this.screenerCache;
  }

  setCachedScreener(data: ScreenerResult): void {
    this.screenerCache = data;
    this.cacheTimestamp = Date.now();
  }

  getCacheAge(): number {
    if (!this.cacheTimestamp) return Infinity;
    return Math.floor((Date.now() - this.cacheTimestamp) / 1000);
  }
}

export const storage = new MemStorage();
