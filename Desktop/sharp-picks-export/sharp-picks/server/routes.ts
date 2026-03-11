import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { getOdds, getSports, analyzePicks, generateDemoPicks, americanOddsToImpliedProb } from "./oddsService";
import { checkCredentials, createSession, destroySession, validateSession, requireAdmin } from "./auth";

// Pre-wire the Odds API key from environment variable on startup
const ENV_API_KEY = process.env.ODDS_API_KEY;

export function registerRoutes(httpServer: Server, app: Express) {
  // On first boot, seed the API key from env if provided
  if (ENV_API_KEY) {
    storage.upsertSettings({ apiKey: ENV_API_KEY }).catch(() => {});
  }

  // ── Auth endpoints ────────────────────────────────────────────
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (!checkCredentials(username, password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = createSession();
    return res.json({ token, username });
  });

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) destroySession(token);
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token && validateSession(token)) {
      return res.json({ authenticated: true, username: "adreyes96" });
    }
    return res.json({ authenticated: false });
  });
  // Get all picks for today — only UPCOMING games (commenceTime in the future)
  app.get("/api/picks", async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();
      const allToday = await storage.getPicksByDate(today);
      // Only return pre-game picks whose game hasn't started yet
      const upcoming = allToday.filter(p => {
        if (p.isLive) return false;
        const gameTime = new Date(p.commenceTime);
        return gameTime > now;
      });
      res.json(upcoming);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get live/in-progress picks — includes picks for games that have started
  app.get("/api/picks/live", async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();
      const allToday = await storage.getPicksByDate(today);
      // In-progress: isLive=true OR commenceTime passed but within ~4 hours
      const inProgress = allToday.filter(p => {
        const gameTime = new Date(p.commenceTime);
        const hoursSinceStart = (now.getTime() - gameTime.getTime()) / 3600000;
        const started = hoursSinceStart >= 0;
        const notFinished = hoursSinceStart < 4;
        return p.isLive || (started && notFinished);
      });
      // Also include any explicitly stored live picks
      const storedLive = await storage.getLivePicks();
      const combined = [...inProgress, ...storedLive.filter(p => !inProgress.find(x => x.id === p.id))];
      res.json(combined);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get all picks (history)
  app.get("/api/picks/all", async (req, res) => {
    try {
      const picks = await storage.getPicks();
      res.json(picks);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update pick result
  app.patch("/api/picks/:id/result", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { result } = req.body;
      const pick = await storage.updatePickResult(id, result);
      if (!pick) return res.status(404).json({ error: "Pick not found" });
      res.json(pick);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Refresh picks - fetches live odds and generates new picks (ADMIN ONLY)
  app.post("/api/picks/refresh", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      const apiKey = settings?.apiKey;
      const sports = settings?.sports ?? ["basketball_nba", "americanfootball_nfl", "baseball_mlb", "icehockey_nhl"];
      const maxPicks = settings?.maxPicksPerDay ?? 20;

      let allPicks: any[] = [];
      let totalCreditsUsed = 0;

      if (!apiKey) {
        // Demo mode — use generated picks
        allPicks = generateDemoPicks();
        await storage.clearTodaysPicks();
        const saved = [];
        for (const pick of allPicks.slice(0, maxPicks)) {
          const saved_pick = await storage.createPick({ ...pick, result: "pending" });
          saved.push(saved_pick);
        }
        await storage.createRefreshLog({ picksGenerated: saved.length, apiCreditsUsed: 0, status: "success" });
        return res.json({ picks: saved, creditsRemaining: null, mode: "demo" });
      }

      // Real API mode
      await storage.clearTodaysPicks();
      const analyzedPicks: any[] = [];

      for (const sport of sports) {
        try {
          const { games, remainingCredits } = await getOdds(apiKey, sport, "us", "h2h,spreads,totals");
          const sportPicks = analyzePicks(games, sport);
          analyzedPicks.push(...sportPicks);

          // Count credit usage: 1 per region per market = 3 markets = 3 credits
          totalCreditsUsed += 3;
        } catch (err) {
          console.error(`Failed to get odds for ${sport}:`, err);
        }
      }

      // Sort by confidence and cap at maxPicks
      const topPicks = analyzedPicks
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxPicks);

      const savedPicks = [];
      for (const pick of topPicks) {
        const saved = await storage.createPick({ ...pick, result: "pending" });
        savedPicks.push(saved);
      }

      await storage.createRefreshLog({
        picksGenerated: savedPicks.length,
        apiCreditsUsed: totalCreditsUsed,
        status: "success",
      });

      res.json({ picks: savedPicks, mode: "live" });
    } catch (e: any) {
      await storage.createRefreshLog({ picksGenerated: 0, apiCreditsUsed: 0, status: "error", error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // Refresh live in-play odds (ADMIN ONLY)
  app.post("/api/picks/refresh-live", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      const apiKey = settings?.apiKey;
      const sports = settings?.sports ?? ["basketball_nba", "icehockey_nhl"];

      if (!apiKey) {
        // Demo mode — no fake live picks; real in-progress games are
        // auto-promoted from today's picks by /api/picks/live based on commenceTime
        return res.json({ picks: [], mode: "demo" });
      }

      // Real live mode - get in-play odds
      const livePicks: any[] = [];
      for (const sport of sports) {
        try {
          const { games } = await getOdds(apiKey, sport, "us", "h2h");
          const now = new Date();
          const inPlayGames = games.filter(g => {
            const start = new Date(g.commence_time);
            const hoursSinceStart = (now.getTime() - start.getTime()) / 3600000;
            return hoursSinceStart > 0 && hoursSinceStart < 4; // started within 4 hours
          });
          const analyzed = analyzePicks(inPlayGames, sport).map(p => ({ ...p, isLive: true }));
          livePicks.push(...analyzed);
        } catch (err) {
          console.error(`Failed live odds for ${sport}:`, err);
        }
      }

      const saved = [];
      for (const pick of livePicks.slice(0, 5)) {
        const s = await storage.createPick({ ...pick, result: "pending" });
        saved.push(s);
      }

      res.json({ picks: saved, mode: "live" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get settings
  app.get("/api/settings", async (req, res) => {
    try {
      const s = await storage.getSettings();
      if (!s) {
        // Return defaults
        return res.json({
          id: 1,
          bankroll: 1000,
          unitSize: 50,
          apiKey: null,
          maxPicksPerDay: 20,
          sports: ["americanfootball_nfl", "basketball_nba", "baseball_mlb", "icehockey_nhl"],
          updatedAt: new Date(),
        });
      }
      res.json(s);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update settings
  app.post("/api/settings", async (req, res) => {
    try {
      const s = await storage.upsertSettings(req.body);
      res.json(s);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get available sports from API
  app.get("/api/sports", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      const apiKey = settings?.apiKey;
      if (!apiKey) {
        return res.json([
          { key: "americanfootball_nfl", title: "NFL" },
          { key: "basketball_nba", title: "NBA" },
          { key: "baseball_mlb", title: "MLB" },
          { key: "icehockey_nhl", title: "NHL" },
          { key: "soccer_epl", title: "EPL Soccer" },
          { key: "basketball_ncaab", title: "NCAA Basketball" },
          { key: "americanfootball_ncaaf", title: "NCAA Football" },
          { key: "tennis_atp_french_open", title: "Tennis" },
          { key: "mma_mixed_martial_arts", title: "MMA/UFC" },
          { key: "golf_pga_championship", title: "Golf" },
        ]);
      }
      const sports = await getSports(apiKey);
      res.json(sports);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get refresh logs
  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await storage.getRefreshLogs(10);
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const allPicks = await storage.getPicks();
      const today = new Date().toISOString().split("T")[0];
      // Count ALL picks generated today (upcoming + in-progress + finished)
      const todayPicks = await storage.getPicksByDate(today);

      const graded = allPicks.filter(p => p.result === "win" || p.result === "loss" || p.result === "push");
      const wins = graded.filter(p => p.result === "win");
      const losses = graded.filter(p => p.result === "loss");
      const winRate = graded.length > 0 ? (wins.length / graded.length) * 100 : 0;

      // Calculate ROI (units)
      const unitsWon = wins.reduce((sum, p) => {
        const odds = p.odds;
        if (odds > 0) return sum + (odds / 100) * p.units;
        return sum + (100 / Math.abs(odds)) * p.units;
      }, 0);
      const unitsLost = losses.reduce((sum, p) => sum + p.units, 0);
      const netUnits = unitsWon - unitsLost;

      const settings = await storage.getSettings();
      const unitSize = settings?.unitSize ?? 50;
      const bankroll = settings?.bankroll ?? 1000;

      res.json({
        todayPicksCount: todayPicks.length,
        totalGraded: graded.length,
        wins: wins.length,
        losses: losses.length,
        winRate: Math.round(winRate * 10) / 10,
        netUnits: Math.round(netUnits * 10) / 10,
        netDollars: Math.round(netUnits * unitSize * 10) / 10,
        unitSize,
        bankroll,
        highConfidencePicks: todayPicks.filter(p => p.confidence >= 78).length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
