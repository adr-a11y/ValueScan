import { z } from "zod";

// Stock data types returned from finance API
export const StockSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  price: z.number().nullable(),
  change: z.number().nullable(),
  changesPercentage: z.number().nullable(),
  marketCap: z.number().nullable(),
  yearHigh: z.number().nullable(),
  yearLow: z.number().nullable(),
  volume: z.number().nullable(),
  avgVolume: z.number().nullable(),
  // Valuation
  pe: z.number().nullable(),
  priceToBook: z.number().nullable(),
  evToEbitda: z.number().nullable(),
  // Ratings
  overallRating: z.string().nullable(),       // S, A+, A, A-, B+, B, B-, C+, C, C-, D+
  dcfScore: z.number().nullable(),
  roeScore: z.number().nullable(),
  roaScore: z.number().nullable(),
  debtEquityScore: z.number().nullable(),
  peScore: z.number().nullable(),
  pbScore: z.number().nullable(),
  // Analyst consensus
  analystConsensus: z.string().nullable(),    // Buy, Hold, Sell, Strong Buy
  analystBuy: z.number().nullable(),
  analystHold: z.number().nullable(),
  analystSell: z.number().nullable(),
  analystStrongBuy: z.number().nullable(),
  analystStrongSell: z.number().nullable(),
  analystTotal: z.number().nullable(),
  analystPriceTarget: z.number().nullable(),
  // Earnings
  lastEarningsDate: z.string().nullable(),    // ISO date string
  earningsWeeksAgo: z.number().nullable(),    // weeks since earnings
  // Undervaluation signals
  pctBelowYearHigh: z.number().nullable(),    // % below 52-wk high
  upside: z.number().nullable(),              // % upside to analyst price target
  // Historical comparison
  historicPeMedian: z.number().nullable(),
  pctBelowHistoricPeMedian: z.number().nullable(),
  beta: z.number().nullable(),
  // ── Technical Indicators ──────────────────────────────────────
  // Momentum
  rsi14: z.number().nullable(),               // RSI(14): <30=oversold, >70=overbought
  stochK: z.number().nullable(),              // Stochastic %K(14,3)
  stochD: z.number().nullable(),              // Stochastic %D
  // MACD
  macdLine: z.number().nullable(),
  macdSignal: z.number().nullable(),
  macdHistogram: z.number().nullable(),
  macdBullish: z.boolean().nullable(),        // histogram > 0
  macdCrossover: z.string().nullable(),       // "bullish" | "bearish" | null
  // Moving averages
  sma20: z.number().nullable(),
  sma50: z.number().nullable(),
  sma200: z.number().nullable(),
  ema20: z.number().nullable(),
  ema50: z.number().nullable(),
  aboveSma20: z.boolean().nullable(),
  aboveSma50: z.boolean().nullable(),
  aboveSma200: z.boolean().nullable(),
  goldenCross: z.string().nullable(),         // "golden" | "death"
  // Bollinger Bands
  bbUpper: z.number().nullable(),
  bbMid: z.number().nullable(),
  bbLower: z.number().nullable(),
  bbPctB: z.number().nullable(),              // 0=at lower, 1=at upper band
  // Volatility / Volume
  atr14: z.number().nullable(),               // Average True Range (14)
  volRatio: z.number().nullable(),            // current vol / 20-day avg vol
  // Summary
  trendSignals: z.array(z.string()).nullable(), // e.g. ["oversold","golden_cross"]
  trend: z.string().nullable(),               // "Bullish"|"Neutral-Bullish"|"Neutral-Bearish"|"Bearish"
});

export type Stock = z.infer<typeof StockSchema>;

export const ScreenerResultSchema = z.object({
  stocks: z.array(StockSchema),
  total: z.number(),
  lastUpdated: z.string(),
  sp500Count: z.number(),
});

export type ScreenerResult = z.infer<typeof ScreenerResultSchema>;

export const StockDetailSchema = StockSchema.extend({
  description: z.string().nullable(),
  priceHistory: z.array(z.object({
    date: z.string(),
    close: z.number(),
  })).optional(),
});

export type StockDetail = z.infer<typeof StockDetailSchema>;
