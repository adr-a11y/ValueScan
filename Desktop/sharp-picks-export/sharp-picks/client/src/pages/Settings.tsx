import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Save, Key, DollarSign, BarChart2, Info, ExternalLink, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Settings } from "@shared/schema";

const settingsSchema = z.object({
  bankroll: z.number().min(10).max(1000000),
  unitSize: z.number().min(1).max(10000),
  apiKey: z.string().optional(),
  maxPicksPerDay: z.number().min(1).max(20),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const SPORTS_OPTIONS = [
  { key: "americanfootball_nfl", label: "🏈 NFL", group: "Football" },
  { key: "americanfootball_ncaaf", label: "🏈 NCAAF", group: "Football" },
  { key: "basketball_nba", label: "🏀 NBA", group: "Basketball" },
  { key: "basketball_ncaab", label: "🏀 NCAAB", group: "Basketball" },
  { key: "baseball_mlb", label: "⚾ MLB", group: "Baseball" },
  { key: "icehockey_nhl", label: "🏒 NHL", group: "Hockey" },
  { key: "soccer_epl", label: "⚽ EPL", group: "Soccer" },
  { key: "soccer_usa_mls", label: "⚽ MLS", group: "Soccer" },
  { key: "mma_mixed_martial_arts", label: "🥊 MMA/UFC", group: "Combat" },
  { key: "tennis_atp_french_open", label: "🎾 Tennis", group: "Other" },
  { key: "golf_pga_championship", label: "⛳ Golf PGA", group: "Other" },
];

export default function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedSports, setSelectedSports] = useState<string[]>([
    "americanfootball_nfl", "basketball_nba", "baseball_mlb", "icehockey_nhl"
  ]);
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: logs = [] } = useQuery<any[]>({
    queryKey: ["/api/logs"],
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      bankroll: 1000,
      unitSize: 50,
      apiKey: "",
      maxPicksPerDay: 20,
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        bankroll: settings.bankroll,
        unitSize: settings.unitSize,
        apiKey: settings.apiKey ?? "",
        maxPicksPerDay: settings.maxPicksPerDay,
      });
      setSelectedSports(settings.sports ?? ["americanfootball_nfl", "basketball_nba", "baseball_mlb", "icehockey_nhl"]);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: SettingsForm & { sports: string[] }) =>
      apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: SettingsForm) => {
    saveMutation.mutate({ ...data, sports: selectedSports });
  };

  const bankroll = watch("bankroll");
  const unitSize = watch("unitSize");
  const maxPicks = watch("maxPicksPerDay");

  const toggleSport = (key: string) => {
    setSelectedSports(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  };

  const unitPercent = bankroll && unitSize ? ((unitSize / bankroll) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your bankroll, unit size, and odds data source</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* API Key */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Key size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">The Odds API Key</h2>
              {settings?.apiKey && (
                <CheckCircle size={13} className="text-emerald-400" />
              )}
            </div>
            <div className="bg-muted/50 border border-border rounded-lg p-3 mb-4 flex gap-3">
              <Info size={13} className="text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                Get a free API key from{" "}
                <a
                  href="https://the-odds-api.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  the-odds-api.com <ExternalLink size={10} />
                </a>
                . The free tier includes 500 credits/month. Without a key, the app runs in <strong className="text-yellow-400">demo mode</strong> with sample picks. Live odds from DraftKings, FanDuel, BetMGM, Caesars, and more.
              </div>
            </div>
            <div className="relative">
              <Input
                data-testid="input-apikey"
                type={showApiKey ? "text" : "password"}
                placeholder="Enter your API key..."
                className="pr-20 bg-background border-input font-mono text-sm"
                {...register("apiKey")}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Bankroll & Units */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Bankroll Management</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bankroll" className="text-xs text-muted-foreground mb-1.5 block">
                  Total Bankroll ($)
                </Label>
                <Input
                  data-testid="input-bankroll"
                  id="bankroll"
                  type="number"
                  min={10}
                  className="bg-background"
                  {...register("bankroll", { valueAsNumber: true })}
                />
                {errors.bankroll && (
                  <p className="text-xs text-red-400 mt-1">{errors.bankroll.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="unitSize" className="text-xs text-muted-foreground mb-1.5 block">
                  Unit Size ($)
                  <span className="ml-2 text-primary">{unitPercent}% of bankroll</span>
                </Label>
                <Input
                  data-testid="input-unitsize"
                  id="unitSize"
                  type="number"
                  min={1}
                  className="bg-background"
                  {...register("unitSize", { valueAsNumber: true })}
                />
                {errors.unitSize && (
                  <p className="text-xs text-red-400 mt-1">{errors.unitSize.message}</p>
                )}
              </div>
            </div>

            {/* Unit sizing guide */}
            <div className="mt-4 grid grid-cols-5 gap-2">
              {[0.5, 1, 1.5, 2, 3].map(u => (
                <div key={u} className="bg-muted rounded-lg p-2 text-center">
                  <div className="text-xs font-bold text-foreground">{u}u</div>
                  <div className="text-xs text-muted-foreground">${((unitSize || 50) * u).toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {u <= 0.5 ? "Lean" : u <= 1 ? "Play" : u <= 1.5 ? "Solid" : u <= 2 ? "Strong" : "Best Bet"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Max picks */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Pick Limits</h2>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs text-muted-foreground">Max picks per day</Label>
                <span className="text-sm font-bold text-primary">{maxPicks}</span>
              </div>
              <Slider
                data-testid="slider-maxpicks"
                min={1}
                max={20}
                step={1}
                value={[maxPicks]}
                onValueChange={([v]) => setValue("maxPicksPerDay", v)}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1</span>
                <span>20</span>
              </div>
            </div>
          </div>

          {/* Sports selection */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={15} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Sports to Analyze</h2>
              <span className="text-xs text-muted-foreground ml-1">(requires paid API key for all)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SPORTS_OPTIONS.map(s => (
                <button
                  key={s.key}
                  type="button"
                  data-testid={`sport-toggle-${s.key}`}
                  onClick={() => toggleSport(s.key)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors border",
                    selectedSports.includes(s.key)
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-muted/50 text-muted-foreground border-transparent hover:border-border hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "w-3 h-3 rounded-sm border-2 shrink-0 flex items-center justify-center",
                    selectedSports.includes(s.key) ? "bg-primary border-primary" : "border-muted-foreground"
                  )}>
                    {selectedSports.includes(s.key) && (
                      <svg viewBox="0 0 8 8" fill="none" className="w-2 h-2">
                        <path d="M1 4L3 6L7 2" stroke="hsl(222,47%,6%)" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            data-testid="btn-save-settings"
            type="submit"
            disabled={saveMutation.isPending}
            className="w-full gap-2"
          >
            <Save size={14} />
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      )}

      {/* Refresh logs */}
      {logs.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Recent Refreshes</h2>
          <div className="space-y-2">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", log.status === "success" ? "bg-emerald-400" : "bg-red-400")} />
                  <span className="text-muted-foreground">
                    {new Date(log.refreshedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{log.picksGenerated} picks</span>
                  <span>{log.apiCreditsUsed} credits</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
