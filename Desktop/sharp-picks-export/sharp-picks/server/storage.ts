import { picks, settings, refreshLog, type Pick, type InsertPick, type Settings, type InsertSettings, type RefreshLog } from "@shared/schema";

export interface IStorage {
  // Picks
  getPicks(): Promise<Pick[]>;
  getPicksByDate(date: string): Promise<Pick[]>;
  getLivePicks(): Promise<Pick[]>;
  createPick(pick: InsertPick): Promise<Pick>;
  updatePickResult(id: number, result: string): Promise<Pick | undefined>;
  clearTodaysPicks(): Promise<void>;

  // Settings
  getSettings(): Promise<Settings | undefined>;
  upsertSettings(settings: Partial<InsertSettings>): Promise<Settings>;

  // Refresh log
  getRefreshLogs(limit?: number): Promise<RefreshLog[]>;
  createRefreshLog(log: { picksGenerated: number; apiCreditsUsed: number; status: string; error?: string }): Promise<RefreshLog>;
}

export class MemStorage implements IStorage {
  private picks: Map<number, Pick> = new Map();
  private settings: Settings | undefined;
  private refreshLogs: RefreshLog[] = [];
  private pickIdCounter = 1;
  private logIdCounter = 1;

  async getPicks(): Promise<Pick[]> {
    return Array.from(this.picks.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getPicksByDate(date: string): Promise<Pick[]> {
    return Array.from(this.picks.values()).filter(p => {
      const pickDate = new Date(p.createdAt).toISOString().split("T")[0];
      return pickDate === date;
    });
  }

  async getLivePicks(): Promise<Pick[]> {
    return Array.from(this.picks.values()).filter(p => p.isLive);
  }

  async createPick(pick: InsertPick): Promise<Pick> {
    const newPick: Pick = {
      ...pick,
      id: this.pickIdCounter++,
      createdAt: new Date(),
      result: pick.result ?? null,
      spread: pick.spread ?? null,
      totalLine: pick.totalLine ?? null,
      eventId: pick.eventId ?? null,
      trends: pick.trends ?? null,
    };
    this.picks.set(newPick.id, newPick);
    return newPick;
  }

  async updatePickResult(id: number, result: string): Promise<Pick | undefined> {
    const pick = this.picks.get(id);
    if (!pick) return undefined;
    const updated = { ...pick, result };
    this.picks.set(id, updated);
    return updated;
  }

  async clearTodaysPicks(): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    for (const [id, pick] of this.picks.entries()) {
      const pickDate = new Date(pick.createdAt).toISOString().split("T")[0];
      if (pickDate === today && !pick.isLive) {
        this.picks.delete(id);
      }
    }
  }

  async getSettings(): Promise<Settings | undefined> {
    return this.settings;
  }

  async upsertSettings(s: Partial<InsertSettings>): Promise<Settings> {
    this.settings = {
      id: 1,
      bankroll: s.bankroll ?? this.settings?.bankroll ?? 1000,
      unitSize: s.unitSize ?? this.settings?.unitSize ?? 50,
      apiKey: s.apiKey ?? this.settings?.apiKey ?? null,
      maxPicksPerDay: s.maxPicksPerDay ?? this.settings?.maxPicksPerDay ?? 20,
      sports: s.sports ?? this.settings?.sports ?? ["americanfootball_nfl", "basketball_nba", "basketball_ncaab", "baseball_mlb", "icehockey_nhl"],
      updatedAt: new Date(),
    };
    return this.settings;
  }

  async getRefreshLogs(limit = 10): Promise<RefreshLog[]> {
    return this.refreshLogs.slice(-limit).reverse();
  }

  async createRefreshLog(log: { picksGenerated: number; apiCreditsUsed: number; status: string; error?: string }): Promise<RefreshLog> {
    const entry: RefreshLog = {
      id: this.logIdCounter++,
      refreshedAt: new Date(),
      picksGenerated: log.picksGenerated,
      apiCreditsUsed: log.apiCreditsUsed,
      status: log.status,
      error: log.error ?? null,
    };
    this.refreshLogs.push(entry);
    return entry;
  }
}

export const storage = new MemStorage();
