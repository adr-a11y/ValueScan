import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeProvider";
import PerplexityAttribution from "@/components/PerplexityAttribution";
import {
  TrendingUp, TrendingDown, RefreshCw, Search, Sun, Moon,
  ArrowUpDown, ArrowUp, ArrowDown, Star, Target, Clock,
  BarChart2, Shield, Zap, Filter, ChevronRight, Activity,
  CandlestickChart, SlidersHorizontal, X
} from "lucide-react";
import type { Stock } from "@shared/schema";

type SortKey = "symbol" | "price" | "changesPercentage" | "marketCap" | "pctBelowYearHigh" | "overallRating" | "analystConsensus" | "earningsWeeksAgo" | "rsi14";
type SortDir = "asc" | "desc";

const RATING_ORDER: Record<string, number> = {
  "S": 12, "S-": 11, "A+": 10, "A": 9, "A-": 8,
  "B+": 7, "B": 6, "B-": 5, "C+": 4, "C": 3, "C-": 2, "D+": 1
};

const CONSENSUS_ORDER: Record<string, number> = {
  "Strong Buy": 4, "Buy": 3, "Hold": 2, "Sell": 1
};

function ratingColor(rating: string | null) {
  if (!rating) return "text-muted-foreground";
  if (["S", "S-", "A+", "A"].includes(rating)) return "text-emerald-500";
  if (["A-", "B+", "B"].includes(rating)) return "text-blue-400";
  if (["B-", "C+", "C"].includes(rating)) return "text-yellow-400";
  return "text-red-400";
}

function consensusColor(consensus: string | null) {
  if (!consensus) return "";
  const c = consensus.toLowerCase();
  if (c.includes("strong buy")) return "bg-emerald-500 text-white hover:bg-emerald-600";
  if (c.includes("buy")) return "bg-blue-500 text-white hover:bg-blue-600";
  if (c.includes("hold")) return "bg-yellow-500 text-black hover:bg-yellow-600";
  return "bg-red-500 text-white hover:bg-red-600";
}

function rsiColor(rsi: number | null) {
  if (rsi === null || rsi === undefined) return "text-muted-foreground";
  if (rsi < 30) return "text-emerald-400"; // oversold = opportunity
  if (rsi > 70) return "text-red-400";     // overbought
  if (rsi < 45) return "text-blue-400";    // mildly oversold
  return "text-muted-foreground";
}

function trendBadgeStyle(trend: string | null) {
  if (!trend) return "bg-muted text-muted-foreground border-border";
  if (trend === "Bullish") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (trend === "Neutral-Bullish") return "bg-blue-500/15 text-blue-400 border-blue-500/20";
  if (trend === "Neutral-Bearish") return "bg-yellow-500/15 text-yellow-500 border-yellow-500/20";
  return "bg-red-500/15 text-red-400 border-red-500/20";
}

function formatMarketCap(mc: number | null) {
  if (!mc) return "—";
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc.toFixed(0)}`;
}

function ScoreBar({ value, max = 5, color = "bg-blue-500" }: { value: number | null; max?: number; color?: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={`h-1.5 w-3 rounded-full ${i < value ? color : "bg-border"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{value}/{max}</span>
    </div>
  );
}

// RSI Gauge mini bar
function RsiGauge({ rsi }: { rsi: number | null }) {
  if (rsi === null || rsi === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.min(Math.max(rsi, 0), 100);
  const color = rsi < 30 ? "bg-emerald-400" : rsi > 70 ? "bg-red-400" : rsi < 45 ? "bg-blue-400" : "bg-muted-foreground/60";
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-1.5">
          <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-xs tabular-nums font-medium ${rsiColor(rsi)}`}>{rsi.toFixed(0)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>RSI(14): {rsi.toFixed(1)}</p>
        <p className="text-xs text-muted-foreground">
          {rsi < 30 ? "Oversold — potential buy signal" : rsi > 70 ? "Overbought" : "Neutral zone"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

type FilterState = {
  earningsFilter: "all" | "recent";
  consensusFilter: "all" | "buy" | "strong_buy";
  ratingFilter: "all" | "A_plus" | "B_plus";
  sectorFilter: string;
  undervaluedOnly: boolean;
  // Technical filters
  rsiFilter: "all" | "oversold" | "neutral" | "overbought";
  trendFilter: "all" | "Bullish" | "Neutral-Bullish" | "Neutral-Bearish" | "Bearish";
  macdFilter: "all" | "bullish" | "bearish" | "bullish_cross" | "bearish_cross";
  smaFilter: "all" | "above_200" | "below_200" | "above_50" | "golden_cross" | "death_cross";
  bbFilter: "all" | "near_lower" | "near_upper";
  newsRiskFilter: "all" | "low_only" | "exclude_high";
  blackrockFilter: "all" | "increased_only";
};

const defaultFilters: FilterState = {
  earningsFilter: "recent",
  consensusFilter: "buy",
  ratingFilter: "all",
  sectorFilter: "all",
  undervaluedOnly: false,
  rsiFilter: "all",
  trendFilter: "all",
  macdFilter: "all",
  smaFilter: "all",
  bbFilter: "all",
  newsRiskFilter: "all",
  blackrockFilter: "all",
};

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("analystConsensus");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [activeTab, setActiveTab] = useState<"screener" | "all">("screener");
  const [showTechFilters, setShowTechFilters] = useState(false);

  const { data, isLoading, error } = useQuery<{
    stocks: Stock[];
    total: number;
    lastUpdated: string;
    sp500Count: number;
    cacheAge?: number;
  }>({ queryKey: ["/api/screener"] });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/screener/refresh");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screener"] });
    },
  });

  const sectors = useMemo(() => {
    if (!data?.stocks) return [];
    const s = new Set(data.stocks.map((st) => st.sector).filter(Boolean));
    return Array.from(s).sort() as string[];
  }, [data?.stocks]);

  const filteredStocks = useMemo(() => {
    if (!data?.stocks) return [];
    let stocks = [...data.stocks];

    if (activeTab === "screener") {
      stocks = stocks.filter((s) => {
        // Earnings filter: 2-6 weeks ago
        if (filters.earningsFilter === "recent") {
          if (s.earningsWeeksAgo === null || s.earningsWeeksAgo === undefined) return false;
          if (s.earningsWeeksAgo < 2 || s.earningsWeeksAgo > 6) return false;
        }

        // Consensus filter
        if (filters.consensusFilter === "buy") {
          const c = (s.analystConsensus || "").toLowerCase();
          if (!c.includes("buy")) return false;
        }
        if (filters.consensusFilter === "strong_buy") {
          const c = (s.analystConsensus || "").toLowerCase();
          if (!c.includes("strong buy")) return false;
        }

        // Rating filter
        if (filters.ratingFilter === "A_plus") {
          if (!s.overallRating || !["S", "S-", "A+", "A"].includes(s.overallRating)) return false;
        }
        if (filters.ratingFilter === "B_plus") {
          if (!s.overallRating || (RATING_ORDER[s.overallRating] || 0) < 6) return false;
        }

        // Sector filter
        if (filters.sectorFilter !== "all" && s.sector !== filters.sectorFilter) return false;

        // Undervalued
        if (filters.undervaluedOnly) {
          if (!s.pctBelowYearHigh || s.pctBelowYearHigh < 15) return false;
          const ratingVal = RATING_ORDER[s.overallRating || ""] || 0;
          if (ratingVal < 5) return false;
        }

        // ── Technical filters ──────────────────────────────
        // RSI filter
        if (filters.rsiFilter === "oversold" && (s.rsi14 === null || (s.rsi14 ?? 50) >= 30)) return false;
        if (filters.rsiFilter === "overbought" && (s.rsi14 === null || (s.rsi14 ?? 50) <= 70)) return false;
        if (filters.rsiFilter === "neutral" && (s.rsi14 === null || (s.rsi14 ?? 50) < 30 || (s.rsi14 ?? 50) > 70)) return false;

        // Trend filter
        if (filters.trendFilter !== "all" && s.trend !== filters.trendFilter) return false;

        // MACD filter
        if (filters.macdFilter === "bullish" && !s.macdBullish) return false;
        if (filters.macdFilter === "bearish" && s.macdBullish !== false) return false;
        if (filters.macdFilter === "bullish_cross" && s.macdCrossover !== "bullish") return false;
        if (filters.macdFilter === "bearish_cross" && s.macdCrossover !== "bearish") return false;

        // SMA filter
        if (filters.smaFilter === "above_200" && !s.aboveSma200) return false;
        if (filters.smaFilter === "below_200" && s.aboveSma200 !== false) return false;
        if (filters.smaFilter === "above_50" && !s.aboveSma50) return false;
        if (filters.smaFilter === "golden_cross" && s.goldenCross !== "golden") return false;
        if (filters.smaFilter === "death_cross" && s.goldenCross !== "death") return false;

        // Bollinger Bands filter
        if (filters.bbFilter === "near_lower" && (s.bbPctB === null || (s.bbPctB ?? 1) > 0.2)) return false;
        if (filters.bbFilter === "near_upper" && (s.bbPctB === null || (s.bbPctB ?? 0) < 0.8)) return false;

        // News risk filter
        if (filters.newsRiskFilter === "low_only" && s.newsRisk !== "Low") return false;
        if (filters.newsRiskFilter === "exclude_high" && s.newsRisk === "High") return false;

        // BlackRock filter
        if (filters.blackrockFilter === "increased_only" && !s.blackrockIncreased) return false;

        return true;
      });
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      stocks = stocks.filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          (s.companyName || "").toLowerCase().includes(q) ||
          (s.sector || "").toLowerCase().includes(q)
      );
    }

    // Sort
    stocks.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "symbol": av = a.symbol; bv = b.symbol; break;
        case "price": av = a.price || 0; bv = b.price || 0; break;
        case "changesPercentage": av = a.changesPercentage || 0; bv = b.changesPercentage || 0; break;
        case "marketCap": av = a.marketCap || 0; bv = b.marketCap || 0; break;
        case "pctBelowYearHigh": av = a.pctBelowYearHigh || 0; bv = b.pctBelowYearHigh || 0; break;
        case "overallRating": av = RATING_ORDER[a.overallRating || ""] || 0; bv = RATING_ORDER[b.overallRating || ""] || 0; break;
        case "analystConsensus": av = CONSENSUS_ORDER[a.analystConsensus || ""] || 0; bv = CONSENSUS_ORDER[b.analystConsensus || ""] || 0; break;
        case "earningsWeeksAgo": av = a.earningsWeeksAgo || 999; bv = b.earningsWeeksAgo || 999; break;
        case "rsi14": av = a.rsi14 || 50; bv = b.rsi14 || 50; break;
        default: av = 0; bv = 0;
      }
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return stocks;
  }, [data?.stocks, search, sortKey, sortDir, filters, activeTab]);

  const kpis = useMemo(() => {
    if (!data?.stocks) return { total: 0, buyRated: 0, recentEarnings: 0, topRated: 0, oversold: 0 };
    const all = data.stocks;
    return {
      total: all.length,
      buyRated: all.filter((s) => (s.analystConsensus || "").toLowerCase().includes("buy")).length,
      recentEarnings: all.filter((s) => s.earningsWeeksAgo !== null && s.earningsWeeksAgo !== undefined && s.earningsWeeksAgo >= 2 && s.earningsWeeksAgo <= 6).length,
      topRated: all.filter((s) => ["S", "S-", "A+", "A", "A-"].includes(s.overallRating || "")).length,
      oversold: all.filter((s) => s.rsi14 !== null && s.rsi14 !== undefined && s.rsi14 < 30).length,
    };
  }, [data?.stocks]);

  // Count active technical filters
  const activeTechFilterCount = [
    filters.rsiFilter !== "all",
    filters.trendFilter !== "all",
    filters.macdFilter !== "all",
    filters.smaFilter !== "all",
    filters.bbFilter !== "all",
    filters.newsRiskFilter !== "all",
    filters.blackrockFilter !== "all",
  ].filter(Boolean).length;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  }

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString()
    : null;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 36 36" width="32" height="32" fill="none" aria-label="ValueScan Logo">
              <rect width="36" height="36" rx="8" fill="hsl(221 83% 53%)" />
              <path d="M8 24L14 14L18 20L22 10L28 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="28" cy="24" r="2" fill="hsl(43 74% 65%)" />
              <circle cx="8" cy="24" r="2" fill="hsl(43 74% 65%)" />
            </svg>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-none">ValueScan</h1>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">S&P 500 Undervalued Stocks</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Updated {lastUpdated}
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            </Button>
            <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-5 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card data-testid="kpi-total">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">S&P 500 Tracked</span>
              </div>
              {isLoading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-2xl font-bold tabular-nums">{kpis.total}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="kpi-buy">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Analyst Buy Rated</span>
              </div>
              {isLoading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-2xl font-bold tabular-nums text-emerald-500">{kpis.buyRated}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="kpi-earnings">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Recent Earnings</span>
              </div>
              {isLoading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-2xl font-bold tabular-nums text-blue-400">{kpis.recentEarnings}</div>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">2–6 weeks ago</p>
            </CardContent>
          </Card>
          <Card data-testid="kpi-rated">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-4 w-4 text-yellow-400" />
                <span className="text-xs text-muted-foreground">A-Rated or Better</span>
              </div>
              {isLoading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-2xl font-bold tabular-nums text-yellow-400">{kpis.topRated}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="kpi-oversold">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CandlestickChart className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">RSI Oversold</span>
              </div>
              {isLoading ? <Skeleton className="h-7 w-16" /> : (
                <div className="text-2xl font-bold tabular-nums text-emerald-400">{kpis.oversold}</div>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">RSI &lt; 30</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs + Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex gap-1 p-1 bg-muted rounded-lg shrink-0">
              <button
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  activeTab === "screener"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("screener")}
                data-testid="tab-screener"
              >
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Smart Screener
                  {!isLoading && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {activeTab === "screener" ? filteredStocks.length : ""}
                    </Badge>
                  )}
                </span>
              </button>
              <button
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  activeTab === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("all")}
                data-testid="tab-all"
              >
                All S&P 500
              </button>
            </div>

            <div className="flex flex-wrap gap-2 flex-1">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search ticker or company..."
                  className="pl-8 h-9 w-52 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>

              {activeTab === "screener" && (
                <>
                  {/* Earnings filter */}
                  <Select
                    value={filters.earningsFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, earningsFilter: v as any }))}
                  >
                    <SelectTrigger className="h-9 w-40 text-sm" data-testid="select-earnings">
                      <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Earnings 2–6 wks</SelectItem>
                      <SelectItem value="all">Any Earnings</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Consensus filter */}
                  <Select
                    value={filters.consensusFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, consensusFilter: v as any }))}
                  >
                    <SelectTrigger className="h-9 w-36 text-sm" data-testid="select-consensus">
                      <Target className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy Consensus</SelectItem>
                      <SelectItem value="strong_buy">Strong Buy</SelectItem>
                      <SelectItem value="all">All Ratings</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Rating filter */}
                  <Select
                    value={filters.ratingFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, ratingFilter: v as any }))}
                  >
                    <SelectTrigger className="h-9 w-36 text-sm" data-testid="select-rating">
                      <Shield className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Grade</SelectItem>
                      <SelectItem value="B_plus">B or Better</SelectItem>
                      <SelectItem value="A_plus">A or Better</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Sector filter */}
                  <Select
                    value={filters.sectorFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, sectorFilter: v }))}
                  >
                    <SelectTrigger className="h-9 w-40 text-sm" data-testid="select-sector">
                      <SelectValue placeholder="All Sectors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sectors</SelectItem>
                      {sectors.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Undervalued toggle */}
                  <Button
                    variant={filters.undervaluedOnly ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    onClick={() => setFilters((f) => ({ ...f, undervaluedOnly: !f.undervaluedOnly }))}
                    data-testid="button-undervalued"
                  >
                    <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
                    Undervalued
                  </Button>

                  {/* Technical filters toggle */}
                  <Button
                    variant={showTechFilters || activeTechFilterCount > 0 ? "default" : "outline"}
                    size="sm"
                    className="h-9 relative"
                    onClick={() => setShowTechFilters((v) => !v)}
                    data-testid="button-tech-filters"
                  >
                    <CandlestickChart className="h-3.5 w-3.5 mr-1.5" />
                    Technicals
                    {activeTechFilterCount > 0 && (
                      <span className="ml-1.5 bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                        {activeTechFilterCount}
                      </span>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Technical Indicator Filter Panel */}
          {activeTab === "screener" && showTechFilters && (
            <div className="bg-muted/40 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CandlestickChart className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Technical Indicator Filters</span>
                  {activeTechFilterCount > 0 && (
                    <Badge variant="secondary" className="text-xs">{activeTechFilterCount} active</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeTechFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setFilters((f) => ({ ...f, rsiFilter: "all", trendFilter: "all", macdFilter: "all", smaFilter: "all", bbFilter: "all", newsRiskFilter: "all" }))}
                    >
                      <X className="h-3 w-3 mr-1" /> Clear tech filters
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTechFilters(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* RSI Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">RSI (14)</label>
                  <Select
                    value={filters.rsiFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, rsiFilter: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-rsi">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any RSI</SelectItem>
                      <SelectItem value="oversold">Oversold (&lt;30)</SelectItem>
                      <SelectItem value="neutral">Neutral (30–70)</SelectItem>
                      <SelectItem value="overbought">Overbought (&gt;70)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-tight">Momentum oscillator. &lt;30 = potential buy.</p>
                </div>

                {/* Trend Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Trend Signal</label>
                  <Select
                    value={filters.trendFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, trendFilter: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-trend">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Trend</SelectItem>
                      <SelectItem value="Bullish">Bullish</SelectItem>
                      <SelectItem value="Neutral-Bullish">Neutral-Bullish</SelectItem>
                      <SelectItem value="Neutral-Bearish">Neutral-Bearish</SelectItem>
                      <SelectItem value="Bearish">Bearish</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-tight">Composite of RSI, MACD, SMAs, Stochastic.</p>
                </div>

                {/* MACD Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">MACD</label>
                  <Select
                    value={filters.macdFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, macdFilter: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-macd">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any MACD</SelectItem>
                      <SelectItem value="bullish">Bullish (hist &gt; 0)</SelectItem>
                      <SelectItem value="bearish">Bearish (hist &lt; 0)</SelectItem>
                      <SelectItem value="bullish_cross">Bullish Crossover</SelectItem>
                      <SelectItem value="bearish_cross">Bearish Crossover</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-tight">12/26/9 EMA crossover system.</p>
                </div>

                {/* SMA Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Moving Avg</label>
                  <Select
                    value={filters.smaFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, smaFilter: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-sma">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any MA</SelectItem>
                      <SelectItem value="above_200">Above 200 SMA</SelectItem>
                      <SelectItem value="below_200">Below 200 SMA</SelectItem>
                      <SelectItem value="above_50">Above 50 SMA</SelectItem>
                      <SelectItem value="golden_cross">Golden Cross (50&gt;200)</SelectItem>
                      <SelectItem value="death_cross">Death Cross (50&lt;200)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-tight">Price vs key moving averages.</p>
                </div>

                {/* Bollinger Bands Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Bollinger Bands</label>
                  <Select
                    value={filters.bbFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, bbFilter: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-bb">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any BB</SelectItem>
                      <SelectItem value="near_lower">Near Lower Band</SelectItem>
                      <SelectItem value="near_upper">Near Upper Band</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-tight">20-period, 2σ bands. Lower = potential bounce.</p>
                </div>
                {/* News Risk Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">News Risk</label>
                  <Select
                    value={filters.newsRiskFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, newsRiskFilter: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-news-risk">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any News Risk</SelectItem>
                      <SelectItem value="exclude_high">Exclude High Risk</SelectItem>
                      <SelectItem value="low_only">Low Risk Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-tight">Based on recent headlines. High = lawsuits, downgrades, fraud.</p>
                </div>
                {/* BlackRock Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">BlackRock</label>
                  <Select
                    value={filters.blackrockFilter}
                    onValueChange={(v) => setFilters((f) => ({ ...f, blackrockFilter: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-blackrock">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="increased_only">Increased Position</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-tight">Filter to stocks where BlackRock raised their stake in latest 13F filing.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results count */}
        {!isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span>
              Showing <strong className="text-foreground">{filteredStocks.length}</strong>
              {activeTab === "screener" ? " matching stocks" : " S&P 500 stocks"}
              {data?.sp500Count && ` (${data.total} of ${data.sp500Count} S&P 500 stocks with data)`}
            </span>
          </div>
        )}

        {/* Main Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">
                    <button className="flex items-center hover:text-foreground" onClick={() => handleSort("symbol")}>
                      Ticker <SortIcon col="symbol" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Sector</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort("price")}>
                      Price <SortIcon col="price" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort("changesPercentage")}>
                      1D % <SortIcon col="changesPercentage" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-medium hidden lg:table-cell">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort("pctBelowYearHigh")}>
                      vs 52-wk Hi <SortIcon col="pctBelowYearHigh" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center font-medium">
                    <button className="flex items-center mx-auto hover:text-foreground" onClick={() => handleSort("overallRating")}>
                      Grade <SortIcon col="overallRating" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center font-medium">
                    <button className="flex items-center mx-auto hover:text-foreground" onClick={() => handleSort("analystConsensus")}>
                      Analyst <SortIcon col="analystConsensus" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center font-medium hidden lg:table-cell">
                    <button className="flex items-center mx-auto hover:text-foreground" onClick={() => handleSort("rsi14")}>
                      RSI <SortIcon col="rsi14" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center font-medium hidden xl:table-cell">Trend</th>
                  <th className="px-4 py-3 text-center font-medium hidden xl:table-cell">MACD</th>
                  <th className="px-4 py-3 text-right font-medium hidden lg:table-cell">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort("marketCap")}>
                      Mkt Cap <SortIcon col="marketCap" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center font-medium hidden sm:table-cell">
                    <button className="flex items-center mx-auto hover:text-foreground" onClick={() => handleSort("earningsWeeksAgo")}>
                      Earnings <SortIcon col="earningsWeeksAgo" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center font-medium hidden sm:table-cell">News</th>
                  <th className="px-4 py-3 text-center font-medium hidden lg:table-cell">BlackRock</th>
                  <th className="px-4 py-3 text-right font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

                {!isLoading && error && (
                  <tr>
                    <td colSpan={15} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <TrendingDown className="h-8 w-8 opacity-50" />
                        <p>Failed to load data. Try refreshing.</p>
                        <Button size="sm" onClick={() => refreshMutation.mutate()}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading && !error && filteredStocks.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Filter className="h-8 w-8 opacity-50" />
                        <p>No stocks match the current filters.</p>
                        <Button size="sm" variant="outline" onClick={() => {
                          setFilters(defaultFilters);
                          setSearch("");
                        }}>
                          Clear All Filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading && filteredStocks.map((stock) => (
                  <StockRow key={stock.symbol} stock={stock} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Legend */}
        {!isLoading && filteredStocks.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground pb-4">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Grade:</span>
              <span className="text-emerald-500 font-medium">S/A</span> = Top rated
              <span className="text-blue-400 font-medium ml-2">B</span> = Good
              <span className="text-yellow-400 font-medium ml-2">C</span> = Average
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium">RSI:</span>
              <span className="text-emerald-400 font-medium">&lt;30</span> = Oversold
              <span className="text-muted-foreground font-medium ml-2">30–70</span> = Neutral
              <span className="text-red-400 font-medium ml-2">&gt;70</span> = Overbought
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium">MACD:</span>
              <span className="text-emerald-400 font-medium">▲</span> = Bullish histogram
              <span className="text-red-400 font-medium ml-2">▼</span> = Bearish histogram
            </div>
          </div>
        )}
      </main>

      <PerplexityAttribution />
    </div>
  );
}

function StockRow({ stock }: { stock: Stock }) {
  const change = stock.changesPercentage || 0;
  const isUp = change >= 0;
  const pctBelow = stock.pctBelowYearHigh;
  const earningsWks = stock.earningsWeeksAgo;
  const inEarningsWindow = earningsWks !== null && earningsWks !== undefined && earningsWks >= 2 && earningsWks <= 6;

  return (
    <tr
      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
      data-testid={`row-stock-${stock.symbol}`}
    >
      <td className="px-4 py-3">
        <Link href={`/stock/${stock.symbol}`}>
          <div>
            <div className="font-semibold text-foreground text-sm tracking-wide">{stock.symbol}</div>
            <div className="text-xs text-muted-foreground truncate max-w-[140px]">{stock.companyName}</div>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        {stock.sector ? (
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {stock.sector}
          </Badge>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium">
        ${stock.price?.toFixed(2) ?? "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        <span className={isUp ? "text-emerald-500" : "text-red-400"}>
          {isUp ? "+" : ""}{change.toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 text-right hidden lg:table-cell">
        {pctBelow !== null && pctBelow !== undefined ? (
          <Tooltip>
            <TooltipTrigger>
              <span className={`tabular-nums font-medium ${pctBelow > 20 ? "text-orange-400" : "text-muted-foreground"}`}>
                -{pctBelow.toFixed(1)}%
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{pctBelow.toFixed(1)}% below 52-week high of ${stock.yearHigh?.toFixed(2)}</p>
            </TooltipContent>
          </Tooltip>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`font-bold text-sm ${ratingColor(stock.overallRating)}`}>
          {stock.overallRating || "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {stock.analystConsensus ? (
          <Badge className={`text-xs whitespace-nowrap ${consensusColor(stock.analystConsensus)}`}>
            {stock.analystConsensus}
          </Badge>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      {/* RSI column */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <RsiGauge rsi={stock.rsi14} />
      </td>
      {/* Trend column */}
      <td className="px-4 py-3 text-center hidden xl:table-cell">
        {stock.trend ? (
          <Tooltip>
            <TooltipTrigger>
              <Badge className={`text-xs whitespace-nowrap border ${trendBadgeStyle(stock.trend)}`}>
                {stock.trend === "Neutral-Bullish" ? "N-Bull" :
                 stock.trend === "Neutral-Bearish" ? "N-Bear" :
                 stock.trend}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{stock.trend}</p>
              {stock.trendSignals && stock.trendSignals.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Signals: {stock.trendSignals.map(s => s.replace(/_/g, ' ')).join(', ')}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      {/* MACD column */}
      <td className="px-4 py-3 text-center hidden xl:table-cell">
        {stock.macdHistogram !== null && stock.macdHistogram !== undefined ? (
          <Tooltip>
            <TooltipTrigger>
              <span className={`text-sm font-bold ${stock.macdBullish ? "text-emerald-400" : "text-red-400"}`}>
                {stock.macdBullish ? "▲" : "▼"}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>MACD Line: {stock.macdLine?.toFixed(2)}</p>
              <p>Signal: {stock.macdSignal?.toFixed(2)}</p>
              <p>Histogram: {stock.macdHistogram?.toFixed(2)}</p>
              {stock.macdCrossover && (
                <p className={`font-medium ${stock.macdCrossover === "bullish" ? "text-emerald-400" : "text-red-400"}`}>
                  {stock.macdCrossover === "bullish" ? "Bullish crossover!" : "Bearish crossover!"}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      <td className="px-4 py-3 text-right hidden lg:table-cell tabular-nums text-xs text-muted-foreground">
        {formatMarketCap(stock.marketCap)}
      </td>
      <td className="px-4 py-3 text-center hidden sm:table-cell">
        {inEarningsWindow ? (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className="text-xs bg-blue-500/15 text-blue-400 border-blue-500/20">
                {earningsWks?.toFixed(1)}w ago
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Earnings reported ~{earningsWks?.toFixed(1)} weeks ago ({stock.lastEarningsDate})</p>
            </TooltipContent>
          </Tooltip>
        ) : earningsWks !== null && earningsWks !== undefined ? (
          <span className="text-xs text-muted-foreground">{earningsWks?.toFixed(1)}w ago</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center hidden sm:table-cell">
        {stock.newsRisk && stock.newsRisk !== "Low" ? (
          <Tooltip>
            <TooltipTrigger>
              <Badge
                className={`text-xs whitespace-nowrap cursor-help ${
                  stock.newsRisk === "High"
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-orange-500/15 text-orange-400 border-orange-500/30"
                }`}
                variant="outline"
              >
                {stock.newsRisk === "High" ? "⚠ High" : "~ Mid"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-medium mb-1">Recent News Risk: {stock.newsRisk}</p>
              {stock.newsHeadlines && stock.newsHeadlines
                .filter((h: any) => h.sentiment === "negative")
                .slice(0, 2)
                .map((h: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground mt-0.5">• {h.title}</p>
                ))
              }
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center hidden lg:table-cell">
        {stock.blackrockIncreased !== null && stock.blackrockIncreased !== undefined ? (
          <Tooltip>
            <TooltipTrigger>
              <Badge
                className={`text-xs whitespace-nowrap cursor-help ${
                  stock.blackrockIncreased
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
                variant="outline"
              >
                {stock.blackrockIncreased
                  ? `▲ +${stock.blackrockPctChange?.toFixed(2)}%`
                  : `▼ ${stock.blackrockPctChange?.toFixed(2)}%`}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">BlackRock {stock.blackrockIncreased ? "increased" : "decreased"} position</p>
              <p className="text-xs text-muted-foreground">{stock.blackrockPctChange && stock.blackrockPctChange > 0 ? "+" : ""}{stock.blackrockPctChange?.toFixed(2)}% change · {stock.blackrockShares?.toLocaleString()} shares</p>
              {stock.blackrockDateReported && (
                <p className="text-xs text-muted-foreground">As of {stock.blackrockDateReported}</p>
              )}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={`/stock/${stock.symbol}`}>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </td>
    </tr>
  );
}
