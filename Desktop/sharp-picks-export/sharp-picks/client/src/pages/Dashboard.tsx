import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Zap, TrendingUp, Trophy, BarChart2, DollarSign, Activity, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import PickCard from "@/components/PickCard";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import type { Pick, Settings } from "@shared/schema";

interface Stats {
  todayPicksCount: number;
  totalGraded: number;
  wins: number;
  losses: number;
  winRate: number;
  netUnits: number;
  netDollars: number;
  unitSize: number;
  bankroll: number;
  highConfidencePicks: number;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="stat-card bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="p-1.5 rounded-lg bg-muted">
          <Icon size={14} className={color ?? "text-primary"} />
        </div>
      </div>
      <div className={cn("text-2xl font-bold", color ?? "text-foreground")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SportFilter({ active, onChange, picks }: {
  active: string;
  onChange: (s: string) => void;
  picks: Pick[];
}) {
  const sports = ["all", ...Array.from(new Set(picks.map(p => p.sport)))];
  const sportLabel = (s: string) => {
    if (s === "all") return "All";
    if (s.includes("ncaab")) return "🏀 NCAAB";
    if (s.includes("ncaaf")) return "🏈 NCAAF";
    if (s.includes("nfl")) return "🏈 NFL";
    if (s.includes("nba")) return "🏀 NBA";
    if (s.includes("mlb") || s.includes("baseball")) return "⚾ MLB";
    if (s.includes("nhl") || s.includes("hockey")) return "🏒 NHL";
    if (s.includes("soccer")) return "⚽ Soccer";
    if (s.includes("mma")) return "🥊 MMA";
    return s.split("_").pop()?.toUpperCase() ?? s;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sports.map(s => (
        <button
          key={s}
          data-testid={`filter-${s}`}
          onClick={() => onChange(s)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            active === s
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          {sportLabel(s)}
          <span className="ml-1.5 opacity-60">
            ({s === "all" ? picks.length : picks.filter(p => p.sport === s).length})
          </span>
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [sportFilter, setSportFilter] = useState("all");
  const [betTypeFilter, setBetTypeFilter] = useState("all");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const { data: picks = [], isLoading: picksLoading } = useQuery<Pick[]>({
    queryKey: ["/api/picks"],
    refetchInterval: 120000, // re-check every 2 min in case games start
  });

  const { data: livePicks = [], isLoading: liveLoading } = useQuery<Pick[]>({
    queryKey: ["/api/picks/live"],
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/picks/refresh"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/picks"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({
        title: "Picks refreshed",
        description: `${data.picks?.length ?? 0} picks generated${data.mode === "demo" ? " (demo mode)" : ""}`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    },
  });

  const liveRefreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/picks/refresh-live"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/picks/live"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Live picks refreshed",
        description: `${data.picks?.length ?? 0} live picks added`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Live refresh failed", description: e.message, variant: "destructive" });
    },
  });

  const gradeMutation = useMutation({
    mutationFn: ({ id, result }: { id: number; result: string }) =>
      apiRequest("PATCH", `/api/picks/${id}/result`, { result }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/picks"] });
      qc.invalidateQueries({ queryKey: ["/api/picks/live"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Pick graded" });
    },
  });

  const unitSize = settings?.unitSize ?? 50;

  // Filter picks
  const filterPicks = (list: Pick[]) => {
    return list.filter(p => {
      if (sportFilter !== "all" && p.sport !== sportFilter) return false;
      if (betTypeFilter !== "all" && p.betType !== betTypeFilter) return false;
      return true;
    });
  };

  const filteredPregame = filterPicks(picks.filter(p => !p.isLive));
  const filteredLive = filterPicks(livePicks);

  // Sort options
  const sortedPregame = [...filteredPregame].sort((a, b) => b.confidence - a.confidence);

  const netColor = (stats?.netUnits ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Today's Picks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {!settings?.apiKey && (
              <span className="ml-2 text-xs bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/20">
                Demo Mode — Add API key in Settings
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              data-testid="btn-refresh-live"
              variant="outline"
              size="sm"
              onClick={() => liveRefreshMutation.mutate()}
              disabled={liveRefreshMutation.isPending}
              className="h-9 gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Activity size={14} className={liveRefreshMutation.isPending ? "animate-spin" : "live-pulse"} />
              Live
            </Button>
            <Button
              data-testid="btn-refresh-picks"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="h-9 gap-2"
            >
              <RefreshCw size={14} className={refreshMutation.isPending ? "animate-spin" : ""} />
              {refreshMutation.isPending ? "Generating..." : "Refresh Picks"}
            </Button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp}
          label="Today's Picks"
          value={String(stats?.todayPicksCount ?? picks.length)}
          sub={`${stats?.highConfidencePicks ?? 0} high confidence`}
        />
        <StatCard
          icon={Trophy}
          label="Win Rate"
          value={stats?.totalGraded ? `${stats.winRate}%` : "—"}
          sub={stats?.totalGraded ? `${stats.wins}W ${stats.losses}L` : "No graded picks yet"}
          color={stats?.totalGraded && stats.winRate >= 55 ? "text-emerald-400" : undefined}
        />
        <StatCard
          icon={BarChart2}
          label="Net Units"
          value={stats?.totalGraded ? `${stats.netUnits >= 0 ? "+" : ""}${stats.netUnits}u` : "—"}
          sub={stats?.totalGraded ? `$${Math.abs(stats.netDollars)} ${stats.netDollars >= 0 ? "profit" : "loss"}` : "Track graded picks"}
          color={stats?.totalGraded ? netColor : undefined}
        />
        <StatCard
          icon={DollarSign}
          label="Unit Size"
          value={`$${unitSize}`}
          sub={`Bankroll: $${settings?.bankroll ?? 1000}`}
        />
      </div>

      {/* Tabs: Pre-game vs Live */}
      <Tabs defaultValue="pregame">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="pregame" data-testid="tab-pregame" className="gap-2">
              <TrendingUp size={13} />
              Pre-Game
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-xs">
                {picks.filter(p => !p.isLive).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="live" data-testid="tab-live" className="gap-2">
              <Zap size={13} />
              Live Bets
              {livePicks.length > 0 && (
                <Badge className="ml-1 h-4 px-1.5 text-xs bg-red-500 hover:bg-red-500">
                  {livePicks.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pregame">
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <SportFilter active={sportFilter} onChange={setSportFilter} picks={picks.filter(p => !p.isLive)} />
            <div className="flex items-center gap-2 ml-auto">
              {["all", "moneyline", "spread", "total"].map(type => (
                <button
                  key={type}
                  data-testid={`bettype-${type}`}
                  onClick={() => setBetTypeFilter(type)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                    betTypeFilter === type
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type === "all" ? "All Types" : type}
                </button>
              ))}
            </div>
          </div>

          {picksLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : sortedPregame.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <TrendingUp size={24} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No picks yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                {isAdmin
                  ? 'Click "Refresh Picks" to generate today\'s best betting picks from current sportsbook odds.'
                  : "Today's picks haven't been generated yet. Check back soon."}
              </p>
              {isAdmin && (
                <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} className="gap-2">
                  <RefreshCw size={14} className={refreshMutation.isPending ? "animate-spin" : ""} />
                  Generate Picks
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedPregame.map(pick => (
                <PickCard
                  key={pick.id}
                  pick={pick}
                  unitSize={unitSize}
                  onGrade={(id, result) => gradeMutation.mutate({ id, result })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="live">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 live-pulse" />
              <span className="text-sm font-medium text-foreground">In-Play Lines</span>
              <span className="text-xs text-muted-foreground">Auto-refreshes every 30s · Pre-game picks auto-promoted when games start</span>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => liveRefreshMutation.mutate()}
                disabled={liveRefreshMutation.isPending}
                className="h-8 gap-2 text-xs"
              >
                <RefreshCw size={12} className={liveRefreshMutation.isPending ? "animate-spin" : ""} />
                Refresh Now
              </Button>
            )}
          </div>

          {liveLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : filteredLive.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Activity size={24} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No live bets right now</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Live in-play picks appear here when games are in progress. Click "Live" to scan for current in-play opportunities.
              </p>
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => liveRefreshMutation.mutate()}
                  disabled={liveRefreshMutation.isPending}
                  className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <Activity size={14} />
                  Scan Live Games
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLive.map(pick => (
                <PickCard
                  key={pick.id}
                  pick={pick}
                  unitSize={unitSize}
                  onGrade={(id, result) => gradeMutation.mutate({ id, result })}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
