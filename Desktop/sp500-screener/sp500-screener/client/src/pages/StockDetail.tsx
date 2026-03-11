import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import PerplexityAttribution from "@/components/PerplexityAttribution";
import {
  ArrowLeft, TrendingUp, TrendingDown, ExternalLink,
  Shield, BarChart2, Star, Target, Clock, DollarSign,
  Activity, Layers, Users, CandlestickChart
} from "lucide-react";
import type { Stock } from "@shared/schema";

const RATING_ORDER: Record<string, number> = {
  "S": 12, "S-": 11, "A+": 10, "A": 9, "A-": 8,
  "B+": 7, "B": 6, "B-": 5, "C+": 4, "C": 3, "C-": 2, "D+": 1
};

function ratingColor(rating: string | null) {
  if (!rating) return "text-muted-foreground";
  if (["S", "S-", "A+", "A"].includes(rating)) return "text-emerald-500";
  if (["A-", "B+", "B"].includes(rating)) return "text-blue-400";
  if (["B-", "C+", "C"].includes(rating)) return "text-yellow-400";
  return "text-red-400";
}

function consensusColor(consensus: string | null) {
  if (!consensus) return "bg-muted text-muted-foreground";
  const c = consensus.toLowerCase();
  if (c.includes("strong buy")) return "bg-emerald-500 text-white";
  if (c.includes("buy")) return "bg-blue-500 text-white";
  if (c.includes("hold")) return "bg-yellow-500 text-black";
  return "bg-red-500 text-white";
}

function ScoreCard({ label, value, description, color = "bg-blue-500" }: {
  label: string;
  value: number | null;
  description: string;
  color?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value ?? "—"}<span className="text-xs text-muted-foreground">/5</span></span>
      </div>
      <Progress value={value ? (value / 5) * 100 : 0} className="h-2" />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function formatMarketCap(mc: number | null) {
  if (!mc) return "—";
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc.toFixed(0)}`;
}

export default function StockDetail() {
  const { symbol } = useParams<{ symbol: string }>();

  const { data: stock, isLoading, error } = useQuery<Stock & {
    description?: string;
  }>({
    queryKey: ["/api/stock", symbol],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Could not load {symbol}</p>
          <Link href="/">
            <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Back to Screener</Button>
          </Link>
        </div>
      </div>
    );
  }

  const change = stock.changesPercentage || 0;
  const isUp = change >= 0;
  const buyTotal = (stock.analystStrongBuy || 0) + (stock.analystBuy || 0);
  const holdTotal = stock.analystHold || 0;
  const sellTotal = (stock.analystSell || 0) + (stock.analystStrongSell || 0);
  const totalAnalysts = stock.analystTotal || (buyTotal + holdTotal + sellTotal);
  const inEarningsWindow = stock.earningsWeeksAgo !== null && stock.earningsWeeksAgo !== undefined
    && stock.earningsWeeksAgo >= 2 && stock.earningsWeeksAgo <= 6;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Back header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
          </Link>
          <div className="h-5 w-px bg-border" />
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{stock.symbol}</span>
            {stock.companyName && ` — ${stock.companyName}`}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Hero card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold tracking-tight">{stock.symbol}</h1>
                  <span className={`text-2xl font-bold ${ratingColor(stock.overallRating)}`}>
                    {stock.overallRating || "—"}
                  </span>
                  {stock.analystConsensus && (
                    <Badge className={`text-sm ${consensusColor(stock.analystConsensus)}`}>
                      {stock.analystConsensus}
                    </Badge>
                  )}
                  {inEarningsWindow && (
                    <Badge variant="secondary" className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {stock.earningsWeeksAgo?.toFixed(1)}w ago
                    </Badge>
                  )}
                </div>
                <p className="text-lg text-muted-foreground font-medium">{stock.companyName}</p>
                {stock.sector && (
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    {stock.sector} · {stock.industry}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end">
                <div className="text-3xl font-bold tabular-nums">${stock.price?.toFixed(2) ?? "—"}</div>
                <div className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-emerald-500" : "text-red-400"}`}>
                  {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {isUp ? "+" : ""}{change.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  52-wk: ${stock.yearLow?.toFixed(2)} – ${stock.yearHigh?.toFixed(2)}
                </div>
              </div>
            </div>

            {stock.description && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed line-clamp-4">
                {stock.description}
              </p>
            )}

            <a
              href={`https://perplexity.ai/finance/${stock.symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View on Perplexity Finance <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Price metrics */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Price Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Current Price</p>
                  <p className="font-semibold tabular-nums text-lg">${stock.price?.toFixed(2) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Market Cap</p>
                  <p className="font-semibold tabular-nums">{formatMarketCap(stock.marketCap)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">52-Wk High</p>
                  <p className="font-semibold tabular-nums">${stock.yearHigh?.toFixed(2) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">52-Wk Low</p>
                  <p className="font-semibold tabular-nums">${stock.yearLow?.toFixed(2) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Below 52-Wk High</p>
                  <p className={`font-semibold tabular-nums ${(stock.pctBelowYearHigh || 0) > 20 ? "text-orange-400" : ""}`}>
                    {stock.pctBelowYearHigh !== null && stock.pctBelowYearHigh !== undefined
                      ? `-${stock.pctBelowYearHigh.toFixed(1)}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Beta</p>
                  <p className="font-semibold tabular-nums">{stock.beta?.toFixed(2) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Volume</p>
                  <p className="font-semibold tabular-nums">
                    {stock.volume ? `${(stock.volume / 1e6).toFixed(1)}M` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Avg Volume</p>
                  <p className="font-semibold tabular-nums">
                    {stock.avgVolume ? `${(stock.avgVolume / 1e6).toFixed(1)}M` : "—"}
                  </p>
                </div>
              </div>

              {/* Price bar showing where current price sits */}
              {stock.yearHigh && stock.yearLow && stock.price && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>52-Wk Low ${stock.yearLow.toFixed(0)}</span>
                    <span>52-Wk High ${stock.yearHigh.toFixed(0)}</span>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-500 via-yellow-400 to-emerald-500 rounded-full"
                      style={{ width: "100%" }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-primary rounded-full shadow"
                      style={{
                        left: `calc(${((stock.price - stock.yearLow) / (stock.yearHigh - stock.yearLow)) * 100}% - 6px)`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-center text-muted-foreground mt-1">
                    Current: ${stock.price.toFixed(2)} ({(((stock.price - stock.yearLow) / (stock.yearHigh - stock.yearLow)) * 100).toFixed(0)}th percentile of 52-wk range)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analyst ratings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Analyst Ratings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stock.analystConsensus ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground text-sm">Consensus</span>
                    <Badge className={`text-sm px-3 py-1 ${consensusColor(stock.analystConsensus)}`}>
                      {stock.analystConsensus}
                    </Badge>
                  </div>

                  {totalAnalysts > 0 && (
                    <div className="space-y-2">
                      {[
                        { label: "Strong Buy", value: stock.analystStrongBuy || 0, color: "bg-emerald-600" },
                        { label: "Buy", value: stock.analystBuy || 0, color: "bg-emerald-400" },
                        { label: "Hold", value: stock.analystHold || 0, color: "bg-yellow-400" },
                        { label: "Sell", value: stock.analystSell || 0, color: "bg-red-400" },
                        { label: "Strong Sell", value: stock.analystStrongSell || 0, color: "bg-red-600" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center gap-3 text-sm">
                          <span className="w-24 text-muted-foreground text-xs">{label}</span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${color}`}
                              style={{ width: `${totalAnalysts > 0 ? (value / totalAnalysts) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="w-6 text-right tabular-nums text-xs font-medium">{value}</span>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground text-right">{totalAnalysts} analysts</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">No analyst data available</p>
              )}

              {/* BlackRock Holding */}
              {stock.blackrockIncreased !== null && stock.blackrockIncreased !== undefined && (
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">BlackRock Position</span>
                    <span className={`ml-auto font-medium flex items-center gap-1 ${stock.blackrockIncreased ? "text-emerald-400" : "text-red-400"}`}>
                      {stock.blackrockIncreased ? "▲ Increased" : "▼ Decreased"}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({stock.blackrockPctChange && stock.blackrockPctChange > 0 ? "+" : ""}{stock.blackrockPctChange?.toFixed(2)}% · {stock.blackrockDateReported})
                      </span>
                    </span>
                  </div>
                  {stock.blackrockShares && (
                    <p className="text-xs text-muted-foreground mt-1">{stock.blackrockShares.toLocaleString()} shares held</p>
                  )}
                </div>
              )}

              {/* Earnings */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last Earnings</span>
                  <span className="ml-auto font-medium">
                    {stock.lastEarningsDate
                      ? `${stock.lastEarningsDate} (${stock.earningsWeeksAgo?.toFixed(1)}w ago)`
                      : "—"}
                  </span>
                </div>
                {inEarningsWindow && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-md bg-blue-500/10 text-blue-400 text-xs">
                    <Activity className="h-3.5 w-3.5" />
                    Within the 2–6 week post-earnings window (historically underreacted period)
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* News Sentiment */}
        {stock.newsHeadlines && stock.newsHeadlines.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Recent News
                {stock.newsRisk && stock.newsRisk !== "Low" && (
                  <span className={`ml-2 text-xs font-normal px-2 py-0.5 rounded-full ${
                    stock.newsRisk === "High"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-orange-500/15 text-orange-400"
                  }`}>
                    {stock.newsRisk} Risk
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stock.newsHeadlines.map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <span className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                      h.sentiment === "negative" ? "bg-red-400" :
                      h.sentiment === "positive" ? "bg-emerald-400" : "bg-muted-foreground"
                    }`} />
                    <div className="flex-1 min-w-0">
                      {h.url ? (
                        <a href={h.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm hover:underline text-foreground line-clamp-2">
                          {h.title}
                        </a>
                      ) : (
                        <p className="text-sm text-foreground line-clamp-2">{h.title}</p>
                      )}
                      {h.date && (
                        <p className="text-xs text-muted-foreground mt-0.5">{h.date}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Financial Health Scores */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Composite Valuation Scores
              <span className="text-xs font-normal text-muted-foreground ml-auto">1 = poor · 5 = excellent</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <ScoreCard
                label="EV / EBITDA"
                value={stock.dcfScore}
                description="Enterprise Value to EBITDA. Lower = cheaper. Score 5 = very low multiple (< 8x), undervalued vs peers."
                color="bg-blue-500"
              />
              <ScoreCard
                label="Return on Equity"
                value={stock.roeScore}
                description="Quality of earnings relative to shareholders' equity. Score 5 = exceptional ROE."
                color="bg-emerald-500"
              />
              <ScoreCard
                label="Return on Assets"
                value={stock.roaScore}
                description="How efficiently the company uses assets to generate profit. Score 5 = very efficient."
                color="bg-teal-500"
              />
              <ScoreCard
                label="Debt to Equity"
                value={stock.debtEquityScore}
                description="Balance sheet leverage. Score 5 = low debt, strong balance sheet."
                color="bg-indigo-500"
              />
              <ScoreCard
                label="P/E Valuation"
                value={stock.peScore}
                description="How cheap the stock is on a price-to-earnings basis vs peers. Score 5 = very cheap."
                color="bg-purple-500"
              />
              <ScoreCard
                label="P/B Valuation"
                value={stock.pbScore}
                description="How the stock trades relative to book value. Score 5 = trading below book value."
                color="bg-pink-500"
              />
            </div>

            {/* Composite gauge */}
            {stock.overallRating && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg flex items-center gap-4">
                <div className={`text-4xl font-black ${ratingColor(stock.overallRating)}`}>
                  {stock.overallRating}
                </div>
                <div>
                  <p className="font-semibold">Overall Grade</p>
                  <p className="text-sm text-muted-foreground">
                    Composite score based on EV/EBITDA, ROE, ROA, Debt/Equity, P/E, and P/B valuations.
                    {["S", "S-", "A+", "A"].includes(stock.overallRating) && " This is among the highest-rated stocks in the S&P 500."}
                    {["B+", "B"].includes(stock.overallRating) && " Above-average fundamentals with solid valuation."}
                    {["B-", "C+", "C"].includes(stock.overallRating) && " Mixed signals — review individual scores."}
                    {stock.overallRating === "D+" && " Below-average across most metrics."}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Technical Indicators ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CandlestickChart className="h-4 w-4 text-muted-foreground" />
              Technical Indicators
              {stock.trend && (
                <Badge className={`ml-auto text-xs border ${
                  stock.trend === "Bullish" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                  stock.trend === "Neutral-Bullish" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" :
                  stock.trend === "Neutral-Bearish" ? "bg-yellow-500/15 text-yellow-500 border-yellow-500/20" :
                  "bg-red-500/15 text-red-400 border-red-500/20"
                }`}>
                  {stock.trend}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Momentum row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* RSI */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">RSI (14)</span>
                  <span className={`text-lg font-bold tabular-nums ${
                    stock.rsi14 !== null && stock.rsi14 !== undefined
                      ? stock.rsi14 < 30 ? "text-emerald-400" : stock.rsi14 > 70 ? "text-red-400" : "text-foreground"
                      : "text-muted-foreground"
                  }`}>
                    {stock.rsi14?.toFixed(1) ?? "—"}
                  </span>
                </div>
                {stock.rsi14 !== null && stock.rsi14 !== undefined && (
                  <div className="space-y-1">
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width: `${Math.min(Math.max(stock.rsi14, 0), 100)}%`,
                          background: stock.rsi14 < 30 ? "#34d399" : stock.rsi14 > 70 ? "#f87171" : "#60a5fa"
                        }}
                      />
                      {/* Oversold/overbought markers */}
                      <div className="absolute top-0 h-full border-l border-dashed border-emerald-400/50" style={{ left: "30%" }} />
                      <div className="absolute top-0 h-full border-l border-dashed border-red-400/50" style={{ left: "70%" }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="text-emerald-400">30</span>
                      <span>Oversold · Neutral · Overbought</span>
                      <span className="text-red-400">70</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stock.rsi14 < 30 ? "Oversold — potential buying opportunity" :
                       stock.rsi14 > 70 ? "Overbought — momentum extended" :
                       "Neutral momentum zone"}
                    </p>
                  </div>
                )}
              </div>

              {/* Stochastic */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Stoch %K</span>
                  <span className={`text-lg font-bold tabular-nums ${
                    stock.stochK !== null && stock.stochK !== undefined
                      ? stock.stochK < 20 ? "text-emerald-400" : stock.stochK > 80 ? "text-red-400" : "text-foreground"
                      : "text-muted-foreground"
                  }`}>
                    {stock.stochK?.toFixed(1) ?? "—"}
                  </span>
                </div>
                {stock.stochK !== null && stock.stochK !== undefined && (
                  <div className="space-y-1">
                    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                      <div className="absolute left-0 top-0 h-full rounded-full bg-blue-400" style={{ width: `${Math.min(stock.stochK, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      %D: {stock.stochD?.toFixed(1) ?? "—"} · 
                      {stock.stochK < 20 ? "Oversold" : stock.stochK > 80 ? "Overbought" : "Neutral"}
                    </p>
                  </div>
                )}
              </div>

              {/* MACD */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">MACD</span>
                  <span className={`text-lg font-bold ${
                    stock.macdBullish ? "text-emerald-400" : stock.macdBullish === false ? "text-red-400" : "text-muted-foreground"
                  }`}>
                    {stock.macdBullish !== null && stock.macdBullish !== undefined
                      ? stock.macdBullish ? "▲ Bull" : "▼ Bear"
                      : "—"}
                  </span>
                </div>
                {stock.macdLine !== null && stock.macdLine !== undefined && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Line</span><span className="font-medium text-foreground tabular-nums">{stock.macdLine?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Signal</span><span className="font-medium text-foreground tabular-nums">{stock.macdSignal?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Histogram</span>
                      <span className={`font-medium tabular-nums ${(stock.macdHistogram ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {stock.macdHistogram?.toFixed(2)}
                      </span>
                    </div>
                    {stock.macdCrossover && (
                      <div className={`mt-1 px-2 py-1 rounded text-xs font-medium ${
                        stock.macdCrossover === "bullish" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      }`}>
                        {stock.macdCrossover === "bullish" ? "⚡ Bullish crossover" : "⚡ Bearish crossover"}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Volume */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Vol Ratio</span>
                  <span className={`text-lg font-bold tabular-nums ${
                    stock.volRatio !== null && stock.volRatio !== undefined
                      ? stock.volRatio > 1.5 ? "text-yellow-400" : "text-foreground"
                      : "text-muted-foreground"
                  }`}>
                    {stock.volRatio !== null && stock.volRatio !== undefined ? `${stock.volRatio.toFixed(2)}x` : "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Today vs 20-day avg volume
                  {stock.volRatio !== null && stock.volRatio !== undefined && (
                    stock.volRatio > 1.5 ? " — elevated activity" :
                    stock.volRatio < 0.5 ? " — quiet session" : ""
                  )}
                </p>
                {stock.atr14 !== null && stock.atr14 !== undefined && (
                  <p className="text-xs text-muted-foreground">ATR(14): <span className="text-foreground font-medium">${stock.atr14.toFixed(2)}</span></p>
                )}
              </div>
            </div>

            {/* Moving Averages */}
            <div className="border-t border-border pt-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Moving Averages</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "SMA 20", value: stock.sma20, above: stock.aboveSma20 },
                  { label: "SMA 50", value: stock.sma50, above: stock.aboveSma50 },
                  { label: "SMA 200", value: stock.sma200, above: stock.aboveSma200 },
                  { label: "EMA 20", value: stock.ema20, above: stock.price && stock.ema20 ? stock.price > stock.ema20 : null },
                  { label: "EMA 50", value: stock.ema50, above: stock.price && stock.ema50 ? stock.price > stock.ema50 : null },
                ].map(({ label, value, above }) => (
                  <div key={label} className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
                    <span className="text-xs text-muted-foreground font-medium">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums font-medium">
                        {value !== null && value !== undefined ? `$${value.toFixed(2)}` : "—"}
                      </span>
                      {above !== null && above !== undefined && (
                        <span className={`text-xs font-bold ${above ? "text-emerald-400" : "text-red-400"}`}>
                          {above ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {/* Golden/Death cross */}
                {stock.goldenCross && (
                  <div className={`flex items-center justify-between rounded-md px-3 py-2 ${
                    stock.goldenCross === "golden" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
                  }`}>
                    <span className="text-xs font-medium">
                      {stock.goldenCross === "golden" ? "✦ Golden Cross" : "✦ Death Cross"}
                    </span>
                    <span className={`text-xs font-bold ${stock.goldenCross === "golden" ? "text-emerald-400" : "text-red-400"}`}>
                      {stock.goldenCross === "golden" ? "SMA50 > 200" : "SMA50 < 200"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bollinger Bands */}
            {stock.bbUpper !== null && stock.bbUpper !== undefined && (
              <div className="border-t border-border pt-4">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Bollinger Bands (20, 2σ)</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Lower: <span className="text-foreground font-medium">${stock.bbLower?.toFixed(2)}</span></span>
                    <span className="text-muted-foreground">Mid: <span className="text-foreground font-medium">${stock.bbMid?.toFixed(2)}</span></span>
                    <span className="text-muted-foreground">Upper: <span className="text-foreground font-medium">${stock.bbUpper?.toFixed(2)}</span></span>
                  </div>
                  {stock.bbPctB !== null && stock.bbPctB !== undefined && (
                    <div className="space-y-1">
                      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                        <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400 via-blue-400 to-red-400 rounded-full" style={{ width: "100%" }} />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-primary rounded-full shadow"
                          style={{ left: `calc(${Math.min(Math.max(stock.bbPctB * 100, 0), 100)}% - 6px)` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        %B: {(stock.bbPctB * 100).toFixed(1)}% — 
                        {stock.bbPctB < 0.1 ? "Near lower band (potential bounce zone)" :
                         stock.bbPctB > 0.9 ? "Near upper band (extended)" :
                         "Within normal range"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Signal tags */}
            {stock.trendSignals && stock.trendSignals.length > 0 && (
              <div className="border-t border-border pt-4">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Active Signals</h4>
                <div className="flex flex-wrap gap-2">
                  {stock.trendSignals.map((signal) => (
                    <Badge key={signal} variant="secondary" className={`text-xs ${
                      signal.includes("golden") || signal.includes("bullish") || signal.includes("oversold") || signal.includes("above_200")
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                        : signal.includes("death") || signal.includes("bearish") || signal.includes("overbought")
                        ? "bg-red-500/15 text-red-400 border-red-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {signal.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PerplexityAttribution />
    </div>
  );
}
