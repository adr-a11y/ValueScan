import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Zap, TrendingUp, Target, BarChart2, TrendingDown, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Pick } from "@shared/schema";

interface PickCardProps {
  pick: Pick;
  unitSize: number;
  onGrade?: (id: number, result: string) => void;
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function impliedProb(odds: number): number {
  if (odds > 0) return Math.round((100 / (odds + 100)) * 100);
  return Math.round((Math.abs(odds) / (Math.abs(odds) + 100)) * 100);
}

function getSportClass(sport: string): string {
  if (sport.includes("nfl") || (sport.includes("football") && !sport.includes("ncaa"))) return "sport-nfl";
  if (sport.includes("ncaab") || sport.includes("ncaaf") || sport.includes("ncaa")) return "sport-ncaab";
  if (sport.includes("nba")) return "sport-nba";
  if (sport.includes("mlb") || sport.includes("baseball")) return "sport-mlb";
  if (sport.includes("nhl") || sport.includes("hockey")) return "sport-nhl";
  if (sport.includes("soccer") || sport.includes("epl")) return "sport-soccer";
  if (sport.includes("mma")) return "sport-mma";
  return "sport-default";
}

function getSportLabel(sport: string): string {
  if (sport.includes("ncaab")) return "NCAAB";
  if (sport.includes("ncaaf")) return "NCAAF";
  if (sport.includes("nfl")) return "NFL";
  if (sport.includes("nba")) return "NBA";
  if (sport.includes("mlb") || sport.includes("baseball")) return "MLB";
  if (sport.includes("nhl") || sport.includes("hockey")) return "NHL";
  if (sport.includes("soccer")) return "Soccer";
  if (sport.includes("mma")) return "MMA";
  if (sport.includes("golf")) return "Golf";
  if (sport.includes("tennis")) return "Tennis";
  return sport.split("_").pop()?.toUpperCase() ?? "Sport";
}

function getConfidenceColor(conf: number): string {
  if (conf >= 80) return "hsl(158, 64%, 52%)";
  if (conf >= 70) return "hsl(39, 96%, 55%)";
  return "hsl(215, 20%, 55%)";
}

function getUnitDots(units: number): { filled: number; total: number } {
  const total = 5;
  const filled = Math.min(Math.ceil(units / 0.5), total);
  return { filled, total };
}

function getBetLabel(pick: Pick): string {
  if (pick.betType === "moneyline") return `${pick.betSide} ML`;
  if (pick.betType === "spread") {
    const point = pick.spread ?? 0;
    return `${pick.betSide} ${point > 0 ? "+" : ""}${point}`;
  }
  if (pick.betType === "total") {
    return `${pick.betSide} ${pick.totalLine}`;
  }
  return pick.betSide;
}

function getResultStyle(result: string | null): string {
  if (result === "win") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (result === "loss") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (result === "push") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-muted text-muted-foreground";
}

function calculatePayout(odds: number, units: number, unitSize: number): string {
  const bet = units * unitSize;
  let payout: number;
  if (odds > 0) {
    payout = bet * (odds / 100);
  } else {
    payout = bet * (100 / Math.abs(odds));
  }
  return payout.toFixed(0);
}

function isGameInProgress(commenceTime: string): boolean {
  const now = new Date();
  const gameTime = new Date(commenceTime);
  const hours = (now.getTime() - gameTime.getTime()) / 3600000;
  return hours >= 0 && hours < 4;
}

export default function PickCard({ pick, unitSize, onGrade }: PickCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showGrade, setShowGrade] = useState(false);

  const inProgress = isGameInProgress(pick.commenceTime);
  const isHot = pick.confidence >= 80;
  const { filled, total } = getUnitDots(pick.units);
  const gameTime = new Date(pick.commenceTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const prob = impliedProb(pick.odds);
  const confColor = getConfidenceColor(pick.confidence);
  const dollarBet = (pick.units * unitSize).toFixed(0);
  const dollarPayout = calculatePayout(pick.odds, pick.units, unitSize);

  return (
    <div
      data-testid={`pick-card-${pick.id}`}
      className={cn(
        "pick-card bg-card border border-border rounded-xl overflow-hidden transition-all duration-200",
        isHot && !inProgress && "pick-card-hot",
        (pick.isLive || inProgress) && "border-l-4 border-l-red-500"
      )}
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-3">
        {/* Top row: sport badges + time */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", getSportClass(pick.sport))}>
              {getSportLabel(pick.sport)}
            </span>
            {(pick.isLive || inProgress) && (
              <span className="live-indicator text-xs font-bold text-red-400 pl-4">
                IN PROGRESS
              </span>
            )}
            {isHot && !pick.isLive && !inProgress && (
              <span className="flex items-center gap-1 text-xs font-semibold text-yellow-400">
                <Zap size={11} className="fill-yellow-400" />
                HOT
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pick.result && pick.result !== "pending" && (
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded border uppercase", getResultStyle(pick.result))}>
                {pick.result}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{gameTime}</span>
          </div>
        </div>

        {/* Matchup */}
        <div className="text-sm text-muted-foreground mb-2">
          {pick.awayTeam} @ {pick.homeTeam}
        </div>

        {/* Main pick */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-lg font-bold text-foreground leading-tight">
              {getBetLabel(pick)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-xl font-mono font-bold", pick.odds > 0 ? "odds-positive" : "odds-negative")}>
                {formatOdds(pick.odds)}
              </span>
              <span className="text-xs text-muted-foreground">({prob}% implied)</span>
            </div>
          </div>

          {/* Unit & dollar sizing */}
          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1 mb-1">
              {Array.from({ length: total }).map((_, i) => (
                <div
                  key={i}
                  className="unit-dot"
                  style={{
                    background: i < filled ? confColor : "hsl(222, 40%, 20%)",
                  }}
                />
              ))}
            </div>
            <div className="text-sm font-bold text-foreground">
              {pick.units}u — ${dollarBet}
            </div>
            <div className="text-xs text-muted-foreground">
              Win: +${dollarPayout}
            </div>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Confidence</span>
            <span className="text-xs font-semibold" style={{ color: confColor }}>
              {pick.confidence}%
            </span>
          </div>
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{
                width: `${pick.confidence}%`,
                background: `linear-gradient(90deg, ${confColor}80, ${confColor})`,
              }}
            />
          </div>
        </div>

        {/* Bookmaker */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target size={11} />
            <span>Best line at <span className="text-foreground font-medium">{pick.bookmaker}</span></span>
          </div>
          <button
            data-testid={`expand-${pick.id}`}
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? "Less" : "Analysis"}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Expanded analysis */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/30">
          {/* Trend Pills */}
          {pick.trends && pick.trends.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp size={12} className="text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400">Key Trends</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {pick.trends.map((trend, i) => {
                  // Color code based on content: records with high wins get green, bad opponent records get amber
                  const isSharp = trend.toLowerCase().includes("sharp") || trend.toLowerCase().includes("steam") || trend.toLowerCase().includes("public");
                  const isRecord = /\d+-\d+/.test(trend);
                  const parts = trend.match(/(\d+)-(\d+)/);
                  const isStrong = parts ? parseInt(parts[1]) / (parseInt(parts[1]) + parseInt(parts[2])) >= 0.8 : false;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-2 text-xs px-2.5 py-1.5 rounded-lg border",
                        isSharp
                          ? "bg-blue-500/10 border-blue-500/20 text-blue-300"
                          : isRecord && isStrong
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                          : "bg-muted/60 border-border text-muted-foreground"
                      )}
                    >
                      <Activity size={10} className="mt-0.5 shrink-0 opacity-70" />
                      <span className="leading-relaxed">{trend}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-2">
            <BarChart2 size={13} className="text-primary" />
            <span className="text-xs font-semibold text-primary">Full Analysis</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{pick.reasoning}</p>

          {/* Grade buttons */}
          {onGrade && pick.result === "pending" && (
            <div className="mt-3 pt-3 border-t border-border">
              {!showGrade ? (
                <button
                  onClick={() => setShowGrade(true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Grade this pick →
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-1">Result:</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onGrade(pick.id, "win")}
                    className="h-7 px-3 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    Win
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onGrade(pick.id, "loss")}
                    className="h-7 px-3 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    Loss
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onGrade(pick.id, "push")}
                    className="h-7 px-3 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                  >
                    Push
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
