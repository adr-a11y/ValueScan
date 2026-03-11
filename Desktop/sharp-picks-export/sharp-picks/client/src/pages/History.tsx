import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Pick } from "@shared/schema";

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getBetLabel(pick: Pick): string {
  if (pick.betType === "moneyline") return `${pick.betSide} ML`;
  if (pick.betType === "spread") {
    const point = pick.spread ?? 0;
    return `${pick.betSide} ${point > 0 ? "+" : ""}${point}`;
  }
  if (pick.betType === "total") return `${pick.betSide} ${pick.totalLine}`;
  return pick.betSide;
}

function getResultStyle(result: string | null): string {
  if (result === "win") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (result === "loss") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (result === "push") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function getSportLabel(sport: string): string {
  if (sport.includes("nfl")) return "NFL";
  if (sport.includes("nba")) return "NBA";
  if (sport.includes("mlb")) return "MLB";
  if (sport.includes("nhl")) return "NHL";
  if (sport.includes("soccer")) return "Soccer";
  if (sport.includes("mma")) return "MMA";
  return sport.split("_").pop()?.toUpperCase() ?? sport;
}

function groupByDate(picks: Pick[]): { date: string; picks: Pick[] }[] {
  const groups: { [date: string]: Pick[] } = {};
  for (const pick of picks) {
    const date = new Date(pick.createdAt).toISOString().split("T")[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(pick);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, picks]) => ({ date, picks }));
}

export default function History() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: allPicks = [], isLoading } = useQuery<Pick[]>({
    queryKey: ["/api/picks/all"],
  });

  const gradeMutation = useMutation({
    mutationFn: ({ id, result }: { id: number; result: string }) =>
      apiRequest("PATCH", `/api/picks/${id}/result`, { result }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/picks/all"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Pick graded" });
    },
  });

  const graded = allPicks.filter(p => p.result === "win" || p.result === "loss" || p.result === "push");
  const wins = graded.filter(p => p.result === "win");
  const losses = graded.filter(p => p.result === "loss");
  const winRate = graded.length > 0 ? (wins.length / graded.length) * 100 : 0;

  const unitsWon = wins.reduce((sum, p) => {
    const odds = p.odds;
    if (odds > 0) return sum + (odds / 100) * p.units;
    return sum + (100 / Math.abs(odds)) * p.units;
  }, 0);
  const unitsLost = losses.reduce((sum, p) => sum + p.units, 0);
  const netUnits = unitsWon - unitsLost;

  const grouped = groupByDate(allPicks);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pick History</h1>
        <p className="text-sm text-muted-foreground mt-1">All picks and results</p>
      </div>

      {/* Summary stats */}
      {graded.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Record</div>
            <div className="text-2xl font-bold text-foreground">{wins.length}W - {losses.length}L</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Win Rate</div>
            <div className={cn("text-2xl font-bold", winRate >= 55 ? "text-emerald-400" : winRate >= 50 ? "text-foreground" : "text-red-400")}>
              {winRate.toFixed(1)}%
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Net Units</div>
            <div className={cn("text-2xl font-bold flex items-center gap-1", netUnits >= 0 ? "text-emerald-400" : "text-red-400")}>
              {netUnits >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {netUnits >= 0 ? "+" : ""}{netUnits.toFixed(1)}u
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total Graded</div>
            <div className="text-2xl font-bold text-foreground">{graded.length}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : allPicks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <BarChart2 size={24} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No picks yet</h3>
          <p className="text-sm text-muted-foreground">Generate your first picks from the dashboard.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ date, picks }) => {
            const dayGraded = picks.filter(p => p.result === "win" || p.result === "loss");
            const dayWins = dayGraded.filter(p => p.result === "win");
            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{picks.length} picks</span>
                    {dayGraded.length > 0 && (
                      <span className={dayWins.length / dayGraded.length >= 0.5 ? "text-emerald-400" : "text-red-400"}>
                        {dayWins.length}W - {dayGraded.length - dayWins.length}L
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {picks.map(pick => (
                    <div
                      key={pick.id}
                      data-testid={`history-pick-${pick.id}`}
                      className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-muted-foreground">{getSportLabel(pick.sport)}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground truncate">{pick.awayTeam} @ {pick.homeTeam}</span>
                        </div>
                        <div className="font-semibold text-foreground text-sm">{getBetLabel(pick)}</div>
                        <div className="text-xs text-muted-foreground">{pick.bookmaker} · {pick.units}u</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={cn("font-mono font-bold text-sm mb-1", pick.odds > 0 ? "text-emerald-400" : "text-foreground")}>
                          {formatOdds(pick.odds)}
                        </div>
                        <div className="text-xs text-muted-foreground">Conf: {pick.confidence}%</div>
                      </div>
                      <div className="shrink-0">
                        {pick.result && pick.result !== "pending" ? (
                          <span className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border uppercase", getResultStyle(pick.result))}>
                            {pick.result}
                          </span>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => gradeMutation.mutate({ id: pick.id, result: "win" })}
                              className="px-2 py-1 text-xs rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            >W</button>
                            <button
                              onClick={() => gradeMutation.mutate({ id: pick.id, result: "loss" })}
                              className="px-2 py-1 text-xs rounded border border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >L</button>
                            <button
                              onClick={() => gradeMutation.mutate({ id: pick.id, result: "push" })}
                              className="px-2 py-1 text-xs rounded border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                            >P</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
