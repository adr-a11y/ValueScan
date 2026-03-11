import { pgTable, text, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Betting picks table
export const picks = pgTable("picks", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  sport: text().notNull(),
  league: text().notNull(),
  homeTeam: text().notNull(),
  awayTeam: text().notNull(),
  commenceTime: text().notNull(),
  betType: text().notNull(), // "moneyline", "spread", "total"
  betSide: text().notNull(), // team name or "over"/"under"
  odds: real().notNull(),
  spread: real(),
  totalLine: real(),
  bookmaker: text().notNull(),
  units: real().notNull(), // 0.5, 1, 1.5, 2, 3, 5
  confidence: real().notNull(), // 0-100
  reasoning: text().notNull(),
  isLive: boolean().notNull().default(false),
  result: text(), // "win", "loss", "push", "pending"
  eventId: text(),
  trends: text().array(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const insertPickSchema = createInsertSchema(picks).omit({
  id: true,
  createdAt: true,
});
export type InsertPick = z.infer<typeof insertPickSchema>;
export type Pick = typeof picks.$inferSelect;

// Settings table
export const settings = pgTable("settings", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bankroll: real().notNull().default(1000),
  unitSize: real().notNull().default(50), // $ per unit
  apiKey: text(),
  maxPicksPerDay: integer().notNull().default(20),
  sports: text().array().notNull().default(["americanfootball_nfl", "basketball_nba", "baseball_mlb", "icehockey_nhl"]),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

// Refresh log
export const refreshLog = pgTable("refresh_log", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  refreshedAt: timestamp().notNull().defaultNow(),
  picksGenerated: integer().notNull().default(0),
  apiCreditsUsed: integer().notNull().default(0),
  status: text().notNull().default("success"),
  error: text(),
});

export type RefreshLog = typeof refreshLog.$inferSelect;
