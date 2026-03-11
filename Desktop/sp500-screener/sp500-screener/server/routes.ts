import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { fetchSP500ScreenerData, refreshSP500Data } from "./financeApi";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes cache

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET /api/screener - main screener endpoint
  // Returns all S&P 500 stocks with their metrics
  app.get("/api/screener", async (req, res) => {
    try {
      // Check cache
      const cached = storage.getCachedScreener();
      const cacheAge = storage.getCacheAge();

      if (cached && cacheAge < CACHE_TTL_SECONDS) {
        return res.json({ ...cached, cacheAge });
      }

      // Fetch fresh data
      console.log("Fetching fresh S&P 500 data...");
      const data = await fetchSP500ScreenerData();

      const result = {
        stocks: data.sp500Stocks,
        total: data.sp500Stocks.length,
        lastUpdated: data.lastUpdated,
        sp500Count: data.sp500Count || 503,
        cacheAge: 0,
      };

      storage.setCachedScreener(result);
      return res.json(result);
    } catch (error: any) {
      console.error("Screener fetch error:", error);
      
      // Return cached data even if stale on error
      const cached = storage.getCachedScreener();
      if (cached) {
        return res.json({ ...cached, error: "Using cached data", cacheAge: storage.getCacheAge() });
      }
      
      return res.status(500).json({ error: error.message || "Failed to fetch stock data" });
    }
  });

  // GET /api/screener/refresh - force refresh
  app.post("/api/screener/refresh", async (req, res) => {
    try {
      console.log("Force refreshing S&P 500 data...");
      const data = await refreshSP500Data();
      const result = {
        stocks: data.sp500Stocks,
        total: data.sp500Stocks.length,
        lastUpdated: data.lastUpdated,
        sp500Count: data.sp500Count || 503,
        cacheAge: 0,
      };
      storage.setCachedScreener(result);
      return res.json({ success: true, total: result.total, lastUpdated: result.lastUpdated });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // GET /api/stock/:symbol - get individual stock detail
  app.get("/api/stock/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const cached = storage.getCachedScreener();
      
      if (!cached) {
        return res.status(404).json({ error: "No data loaded. Fetch screener first." });
      }
      
      const stock = cached.stocks.find((s: any) => s.symbol === symbol.toUpperCase());
      if (!stock) {
        return res.status(404).json({ error: `Stock ${symbol} not found` });
      }
      
      // Fetch price history for the stock
      const pricePath = path.join(process.cwd(), "server/price_history_cache.json");
      let priceHistory = null;
      
      if (fs.existsSync(pricePath)) {
        try {
          const rawHistory = JSON.parse(fs.readFileSync(pricePath, "utf-8"));
          priceHistory = rawHistory[symbol];
        } catch {}
      }
      
      return res.json({ ...stock, priceHistory });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // GET /api/sectors - get sector breakdown
  app.get("/api/sectors", async (req, res) => {
    try {
      const cached = storage.getCachedScreener();
      if (!cached) {
        return res.json([]);
      }
      
      const sectorMap: Record<string, { count: number; buyCount: number; avgRating: number }> = {};
      
      for (const stock of cached.stocks as any[]) {
        const sector = stock.sector || "Unknown";
        if (!sectorMap[sector]) {
          sectorMap[sector] = { count: 0, buyCount: 0, avgRating: 0 };
        }
        sectorMap[sector].count++;
        const consensus = (stock.analystConsensus || "").toLowerCase();
        if (consensus.includes("buy")) sectorMap[sector].buyCount++;
      }
      
      const sectors = Object.entries(sectorMap)
        .map(([name, data]) => ({
          name,
          ...data,
          buyPct: data.count > 0 ? Math.round((data.buyCount / data.count) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
      
      return res.json(sectors);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // GET /api/status - health check
  app.get("/api/status", async (req, res) => {
    const cached = storage.getCachedScreener();
    return res.json({
      hasData: !!cached,
      stockCount: cached?.stocks?.length || 0,
      lastUpdated: cached?.lastUpdated || null,
      cacheAge: storage.getCacheAge(),
    });
  });

  return httpServer;
}
