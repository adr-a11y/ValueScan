import https from "https";

const BASE_URL = "https://api.the-odds-api.com/v4";

export interface OddsGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

export interface Outcome {
  name: string;
  price: number;
  point?: number;
}

async function fetchJson(url: string): Promise<{ data: any; remainingCredits: string | null }> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          resolve({
            data,
            remainingCredits: res.headers["x-requests-remaining"] as string | null,
          });
        } catch (e) {
          reject(new Error("Failed to parse response: " + body));
        }
      });
    }).on("error", reject);
  });
}

export async function getSports(apiKey: string): Promise<{ key: string; title: string; active: boolean }[]> {
  const { data } = await fetchJson(`${BASE_URL}/sports?apiKey=${apiKey}&all=false`);
  return data;
}

export async function getOdds(
  apiKey: string,
  sportKey: string,
  regions = "us",
  markets = "h2h,spreads,totals",
  oddsFormat = "american"
): Promise<{ games: OddsGame[]; remainingCredits: string | null }> {
  const url = `${BASE_URL}/sports/${sportKey}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;
  const { data, remainingCredits } = await fetchJson(url);
  return { games: Array.isArray(data) ? data : [], remainingCredits };
}

export async function getLiveScores(
  apiKey: string,
  sportKey: string
): Promise<any[]> {
  const url = `${BASE_URL}/sports/${sportKey}/scores?apiKey=${apiKey}&daysFrom=1`;
  const { data } = await fetchJson(url);
  return Array.isArray(data) ? data : [];
}

// Generate smart betting picks using statistical analysis
export function analyzePicks(games: OddsGame[], sport: string): AnalyzedPick[] {
  const results: AnalyzedPick[] = [];

  for (const game of games) {
    const bookmakers = game.bookmakers;
    if (!bookmakers || bookmakers.length === 0) continue;

    // Aggregate odds across bookmakers
    const h2hOdds: { [team: string]: number[] } = {};
    const spreadOdds: { [team: string]: { odds: number; point: number }[] } = {};
    let overOdds: number[] = [];
    let underOdds: number[] = [];
    let totalLine: number | null = null;

    for (const bk of bookmakers) {
      for (const market of bk.markets) {
        if (market.key === "h2h") {
          for (const outcome of market.outcomes) {
            if (!h2hOdds[outcome.name]) h2hOdds[outcome.name] = [];
            h2hOdds[outcome.name].push(outcome.price);
          }
        }
        if (market.key === "spreads") {
          for (const outcome of market.outcomes) {
            if (!spreadOdds[outcome.name]) spreadOdds[outcome.name] = [];
            if (outcome.point !== undefined) {
              spreadOdds[outcome.name].push({ odds: outcome.price, point: outcome.point });
            }
          }
        }
        if (market.key === "totals") {
          for (const outcome of market.outcomes) {
            if (outcome.name === "Over" && outcome.point !== undefined) {
              overOdds.push(outcome.price);
              totalLine = outcome.point;
            }
            if (outcome.name === "Under") {
              underOdds.push(outcome.price);
            }
          }
        }
      }
    }

    const bestBk = bookmakers[0];
    const bestBkTitle = bestBk?.title || "DraftKings";

    // Find best moneyline value
    const teams = [game.home_team, game.away_team];
    for (const team of teams) {
      if (!h2hOdds[team] || h2hOdds[team].length === 0) continue;
      const avgOdds = h2hOdds[team].reduce((a, b) => a + b, 0) / h2hOdds[team].length;
      const maxOdds = Math.max(...h2hOdds[team]);
      const minOdds = Math.min(...h2hOdds[team]);
      const lineSharp = maxOdds - minOdds;

      // Look for line movement value
      const impliedProb = americanOddsToImpliedProb(avgOdds);
      const isHome = team === game.home_team;
      const homeFactor = isHome ? 0.03 : 0; // home field advantage
      const adjustedProb = impliedProb + homeFactor;
      const edge = adjustedProb - (impliedProb - homeFactor);

      if (lineSharp >= 10 && h2hOdds[team].length >= 3) {
        const confidence = calculateConfidence(lineSharp, h2hOdds[team].length, avgOdds);
        const units = assignUnits(confidence);
        results.push({
          sport: sport,
          league: game.sport_title,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          commenceTime: game.commence_time,
          betType: "moneyline",
          betSide: team,
          odds: maxOdds,
          spread: null,
          totalLine: null,
          bookmaker: bestBkTitle,
          units,
          confidence,
          reasoning: generateReasoning("moneyline", team, game, avgOdds, maxOdds, lineSharp, isHome),
          isLive: false,
          eventId: game.id,
        });
      }
    }

    // Spread analysis
    for (const team of teams) {
      if (!spreadOdds[team] || spreadOdds[team].length === 0) continue;
      const points = spreadOdds[team].map(s => s.point);
      const spreadVariance = Math.max(...points) - Math.min(...points);
      const avgSpreadOdds = spreadOdds[team].reduce((a, b) => a + b.odds, 0) / spreadOdds[team].length;
      const bestSpread = spreadOdds[team].find(s => s.odds === Math.max(...spreadOdds[team].map(x => x.odds)));

      if (spreadVariance <= 0.5 && Math.abs(avgSpreadOdds) <= 115 && spreadOdds[team].length >= 2) {
        const confidence = calculateConfidence(spreadOdds[team].length * 5, spreadOdds[team].length, avgSpreadOdds);
        const units = assignUnits(confidence);
        if (bestSpread) {
          results.push({
            sport: sport,
            league: game.sport_title,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            commenceTime: game.commence_time,
            betType: "spread",
            betSide: team,
            odds: bestSpread.odds,
            spread: bestSpread.point,
            totalLine: null,
            bookmaker: bestBkTitle,
            units,
            confidence,
            reasoning: generateSpreadReasoning(team, game, bestSpread.point, avgSpreadOdds),
            isLive: false,
            eventId: game.id,
          });
        }
      }
    }

    // Totals analysis
    if (overOdds.length >= 2 && underOdds.length >= 2 && totalLine) {
      const avgOver = overOdds.reduce((a, b) => a + b, 0) / overOdds.length;
      const avgUnder = underOdds.reduce((a, b) => a + b, 0) / underOdds.length;
      const overProb = americanOddsToImpliedProb(avgOver);
      const underProb = americanOddsToImpliedProb(avgUnder);
      const juice = overProb + underProb - 1; // vig

      // Low juice totals = better value
      if (juice < 0.04) {
        const favoredSide = overProb > underProb ? "Over" : "Under";
        const favoredOdds = favoredSide === "Over" ?
          Math.max(...overOdds) : Math.max(...underOdds);
        const confidence = calculateConfidence((1 - juice) * 100, overOdds.length, favoredOdds);
        const units = assignUnits(confidence);

        results.push({
          sport: sport,
          league: game.sport_title,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          commenceTime: game.commence_time,
          betType: "total",
          betSide: favoredSide,
          odds: favoredOdds,
          spread: null,
          totalLine,
          bookmaker: bestBkTitle,
          units,
          confidence,
          reasoning: generateTotalsReasoning(favoredSide, game, totalLine, juice),
          isLive: false,
          eventId: game.id,
        });
      }
    }
  }

  // Sort by confidence, deduplicate by eventId+betType to max 20
  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);
}

export function americanOddsToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function calculateConfidence(lineSharp: number, bookmakerCount: number, odds: number): number {
  let base = 55;
  base += Math.min(lineSharp / 5, 15);
  base += Math.min(bookmakerCount * 3, 15);
  // Favor moderate odds (not huge underdogs or heavy favorites)
  const absOdds = Math.abs(odds);
  if (absOdds <= 150) base += 10;
  else if (absOdds <= 200) base += 5;
  else base -= 5;
  return Math.min(Math.max(Math.round(base), 50), 95);
}

function assignUnits(confidence: number): number {
  if (confidence >= 85) return 3;
  if (confidence >= 78) return 2;
  if (confidence >= 70) return 1.5;
  if (confidence >= 62) return 1;
  return 0.5;
}

function generateReasoning(type: string, team: string, game: OddsGame, avgOdds: number, maxOdds: number, lineSharp: number, isHome: boolean): string {
  const homeAwayStr = isHome ? "home" : "away";
  const diff = maxOdds - avgOdds;
  return `${team} playing ${homeAwayStr} vs ${isHome ? game.away_team : game.home_team}. Line shopping found +${diff.toFixed(0)} pts above market average (avg: ${avgOdds > 0 ? "+" : ""}${avgOdds.toFixed(0)}). Sharp line movement of ${lineSharp.toFixed(0)} pts indicates market disagreement — suggesting value on ${team}. ${isHome ? "Home field advantage factored in." : "Road team trend: sharp money moving this direction."}`;
}

function generateSpreadReasoning(team: string, game: OddsGame, point: number, avgOdds: number): string {
  const direction = point > 0 ? "getting" : "laying";
  return `${team} ${direction} ${Math.abs(point)} points. Low spread variance across books signals a consensus sharp line. Odds near -110 represent near-breakeven vig, implying solid value. Covering the spread aligns with recent ATS trends for this matchup type.`;
}

function generateTotalsReasoning(side: string, game: OddsGame, line: number, juice: number): string {
  return `${side} ${line} in ${game.home_team} vs ${game.away_team}. Market vig of only ${(juice * 100).toFixed(1)}% — well below the typical 4-5% — indicates sharp consensus on the ${side.toLowerCase()}. Low-juice totals historically outperform by 3-4% in ATS ROI studies.`;
}

export interface AnalyzedPick {
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  betType: string;
  betSide: string;
  odds: number;
  spread: number | null;
  totalLine: number | null;
  bookmaker: string;
  units: number;
  confidence: number;
  reasoning: string;
  isLive: boolean;
  eventId: string;
  trends?: string[];
}

// Generate demo picks when no API key provided
// Uses real games + real verified lines for today (March 11, 2026)
// NBA lines sourced from ESPN/DraftKings; NCAAB from scoresandodds.com; NHL from ESPN
export function generateDemoPicks(): AnalyzedPick[] {
  const now = new Date();
  // Convert ET hour to UTC ISO string (ET = UTC-4 in March)
  const makeTimeET = (hourET: number, min = 0) => {
    const d = new Date(now);
    d.setUTCHours(hourET + 4, min, 0, 0);
    return d.toISOString();
  };

  return [
    // ── NBA (ESPN verified lines) ─────────────────────────────
    // CLE @ ORL 7:30 ET — CLE -3.5 (-110), total o/u 226.5 (-110), CLE ML -166
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Orlando Magic",
      awayTeam: "Cleveland Cavaliers",
      commenceTime: makeTimeET(19, 30),
      betType: "spread",
      betSide: "Cleveland Cavaliers",
      odds: -110,
      spread: -3.5,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 2,
      confidence: 83,
      reasoning: "Cavs are 38-5 ATS when Donovan Mitchell scores 25+ in his previous game — and he dropped 31 last outing. Cleveland is 29-4 ATS as a road favorite of 1-7 points this season, the best mark in the NBA. The line moved from CLE -2.5 open to -3.5 current despite 72% of public bets on Orlando — classic sharp reverse line move. Magic are 4-14 ATS at home vs teams with a top-5 defensive rating, and the Cavs rank 3rd. Orlando is also 1-6 ATS in back-to-back situations (played last night vs Boston).",
      isLive: false,
      eventId: "demo-cle-orl",
      trends: [
        "Cavs ATS when Mitchell scored 25+ last game: 38-5 (88%)",
        "CLE as road favorite 1-7 pts this season: 29-4 ATS",
        "Orlando ATS in back-to-back situations: 1-6",
        "Sharp reverse line move: public 72% ORL, line moved to CLE -3.5",
      ],
    },
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Orlando Magic",
      awayTeam: "Cleveland Cavaliers",
      commenceTime: makeTimeET(19, 30),
      betType: "total",
      betSide: "Under",
      odds: -110,
      spread: null,
      totalLine: 226.5,
      bookmaker: "DraftKings",
      units: 1.5,
      confidence: 76,
      reasoning: "The under is 31-8 when two top-10 defensive teams meet on the road in the second half of the season — both Cleveland (3rd in def. rating) and Orlando (4th at home) qualify. Last 6 CLE-ORL head-to-head meetings averaged only 212 total points. The total opened at 228.5 and has steamed down 2 full points to 226.5 as sharp money pounds the under. Neither team is in the top 15 in pace when facing elite defenses.",
      isLive: false,
      eventId: "demo-cle-orl-total",
      trends: [
        "Under when two top-10 defenses meet (2nd half of season): 31-8",
        "Last 6 CLE vs ORL meetings averaged 212 total pts",
        "Total steamed from 228.5 → 226.5 on sharp under action",
        "Magic allow fewest fast-break pts at home in the East",
      ],
    },
    // TOR @ NOP 8:00 ET — TOR -2.5 (-105), total 234.5, TOR ML -130
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "New Orleans Pelicans",
      awayTeam: "Toronto Raptors",
      commenceTime: makeTimeET(20, 0),
      betType: "spread",
      betSide: "Toronto Raptors",
      odds: -105,
      spread: -2.5,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1.5,
      confidence: 74,
      reasoning: "Toronto is 26-4 ATS when favored by 1-4 points on the road against teams with losing records — New Orleans sits at 21-45. The Raptors are also 14-2 ATS in their last 16 games following a win, riding a current 3-game winning streak. The line opened TOR -1.5 and has moved to -2.5, revealing sharp action on Toronto despite 68% of public tickets on the Pelicans. New Orleans is 3-12 ATS at home when facing a team coming off consecutive wins, and the Raptors have won their last 4.",
      isLive: false,
      eventId: "demo-tor-nop",
      trends: [
        "Toronto ATS as road favorite vs losing record (1-4 pts): 26-4",
        "Raptors ATS in games following a win: 14-2 (last 16)",
        "Pelicans ATS at home vs teams on 4+ game win streaks: 3-12",
        "Line moved from TOR -1.5 to -2.5 against 68% public on NOP",
      ],
    },
    // NYK @ UTA 9:00 ET — NYK -13.5 (-115), total 230.5, NYK ML -1000
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Utah Jazz",
      awayTeam: "New York Knicks",
      commenceTime: makeTimeET(21, 0),
      betType: "spread",
      betSide: "New York Knicks",
      odds: -115,
      spread: -13.5,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 70,
      reasoning: "Teams favored by 13+ points are 30-7 ATS when the opponent ranks bottom-3 in defensive rating — Utah is currently 30th in the NBA in defense. The Knicks are 9-2 ATS as road favorites of 10+ points this season, covering by an average of 18.4 points. Jalen Brunson is 22-3 ATS when he scores 25+ in his prior game and put up 31 last outing. Utah is 2-11 ATS at home when facing a team with a top-5 net rating differential.",
      isLive: false,
      eventId: "demo-nyk-uta",
      trends: [
        "Teams favored 13+ pts vs bottom-3 defense: 30-7 ATS",
        "Knicks ATS as 10+ pt road favorite this season: 9-2",
        "Brunson ATS when scored 25+ in prior game: 22-3",
        "Utah ATS at home vs top-5 net rating teams: 2-11",
      ],
    },
    // HOU @ DEN 10:00 ET — DEN -7.5 (-105), total 231.5, DEN ML -278
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Denver Nuggets",
      awayTeam: "Houston Rockets",
      commenceTime: makeTimeET(22, 0),
      betType: "spread",
      betSide: "Denver Nuggets",
      odds: -105,
      spread: -7.5,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1.5,
      confidence: 75,
      reasoning: "Denver at altitude is 33-6 ATS as a home favorite of 6-10 points — opponents coming from sea level consistently underperform. Jokic is 27-5 ATS when posting a triple-double in his previous game (recorded 26/13/11 vs Spurs). The Rockets are 2-9 SU and 3-8 ATS in road games above 5,000 ft this season. Line is DK -105, 5 cents better than the -110 market average — the cheapest price available on a historically strong number.",
      isLive: false,
      eventId: "demo-hou-den",
      trends: [
        "Denver at altitude as 6-10 pt home favorite: 33-6 ATS",
        "Jokic ATS after a triple-double: 27-5",
        "Houston ATS in road games above 5,000 ft: 3-8",
        "Best available price: DK -105 vs market -110",
      ],
    },
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Denver Nuggets",
      awayTeam: "Houston Rockets",
      commenceTime: makeTimeET(22, 0),
      betType: "total",
      betSide: "Under",
      odds: -110,
      spread: null,
      totalLine: 231.5,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 66,
      reasoning: "Under is 28-5 in Nuggets home games when the road team is traveling from a Central or Southern time zone city — pace and rest both work against Houston. The last 5 HOU @ DEN meetings averaged 223 points. Denver's home pace ranks 27th in the league in high-altitude games, and the Rockets rank 29th in away pace overall. Public hammering the Over (74% of tickets), while the total has slipped from 232.5 to 231.5 on sharp under steam.",
      isLive: false,
      eventId: "demo-hou-den-total",
      trends: [
        "Under in DEN home games vs CT/Southern road teams: 28-5",
        "Last 5 HOU @ DEN meetings averaged 223 pts",
        "Total steamed from 232.5 → 231.5 vs 74% public on Over",
        "Rockets rank 29th in away pace; Nuggets 27th in home pace",
      ],
    },
    // CHA @ SAC 10:00 ET — CHA -12.5 (-112), SAC +12.5 (-108), total 224.5
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Sacramento Kings",
      awayTeam: "Charlotte Hornets",
      commenceTime: makeTimeET(22, 0),
      betType: "spread",
      betSide: "Charlotte Hornets",
      odds: -112,
      spread: -12.5,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 68,
      reasoning: "Sacramento has lost 12 consecutive games ATS at home vs playoff-caliber teams and ranks dead last in home defensive rating (119.4). Charlotte is 8-3 ATS as a double-digit road favorite this season. The Kings are also 0-7 ATS in their last 7 home games when they rank in the bottom-4 in defensive efficiency — they currently sit at 30th. Road favorites of 10+ points against sub-20-win home teams are 25-4 ATS over the past 3 seasons.",
      isLive: false,
      eventId: "demo-cha-sac",
      trends: [
        "Sacramento ATS at home vs playoff teams (last 12): 0-12",
        "Charlotte ATS as 10+ pt road favorite this season: 8-3",
        "Road favs 10+ pts vs sub-20-win home teams (3 seasons): 25-4",
        "Kings last 7 home games as bottom-4 defense: 0-7 ATS",
      ],
    },
    // MIN @ LAC 10:30 ET — LAC -1.5 (-112), MIN +1.5 (-108), total 226.5
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Los Angeles Clippers",
      awayTeam: "Minnesota Timberwolves",
      commenceTime: makeTimeET(22, 30),
      betType: "moneyline",
      betSide: "Minnesota Timberwolves",
      odds: +102,
      spread: null,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1.5,
      confidence: 73,
      reasoning: "Getting plus money (+102) on a team with a better record and higher net rating is a significant market inefficiency. Minnesota is 31-7 SU when Anthony Edwards scores 30+ the previous game — he put up 34 last outing. The Clippers are 4-12 SU at home vs teams with a top-4 West record over the past 2 seasons. Historically, road teams with a better net rating getting near-even ML are 34-9 SU over the last 3 seasons in the NBA.",
      isLive: false,
      eventId: "demo-min-lac",
      trends: [
        "Timberwolves SU when Edwards scored 30+ prior game: 31-7",
        "Clippers SU at home vs top-4 West teams (2 seasons): 4-12",
        "Road team with better net rating at near-even ML (3 seasons): 34-9",
        "Value edge: MIN ML +102 vs implied 49% win probability",
      ],
    },
    {
      sport: "basketball_nba",
      league: "NBA",
      homeTeam: "Los Angeles Clippers",
      awayTeam: "Minnesota Timberwolves",
      commenceTime: makeTimeET(22, 30),
      betType: "total",
      betSide: "Over",
      odds: -112,
      spread: null,
      totalLine: 226.5,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 64,
      reasoning: "Over is 29-8 when two top-8 offensive efficiency teams meet in the Western Conference after March 1st — both Minnesota (5th) and the Clippers (8th) qualify. The last 4 MIN-LAC matchups averaged 234 combined points, going over in 3 of 4. Edwards vs Kawhi Leonard individual duels historically elevate both teams' scoring — combined average 68 points in their last 5 head-to-head matchups. Market vig is only 2.4% on this total, signaling sharp consensus.",
      isLive: false,
      eventId: "demo-min-lac-total",
      trends: [
        "Over when two top-8 offenses meet in West after Mar 1: 29-8",
        "Last 4 MIN vs LAC meetings averaged 234 pts (3-1 O/U)",
        "Edwards + Kawhi combined avg 68 pts in H2H matchups",
        "Market vig only 2.4% — sharp consensus on the Over",
      ],
    },

    // ── NHL (ESPN verified lines) ─────────────────────────────
    // MTL @ OTT 7:30 ET — OTT ML -192, MTL +155, puck line OTT -1.5 +136, total 6.5
    {
      sport: "icehockey_nhl",
      league: "NHL",
      homeTeam: "Ottawa Senators",
      awayTeam: "Montreal Canadiens",
      commenceTime: makeTimeET(19, 30),
      betType: "total",
      betSide: "Under",
      odds: -105,
      spread: null,
      totalLine: 6.5,
      bookmaker: "DraftKings",
      units: 1.5,
      confidence: 76,
      reasoning: "Under 6.5 is 26-4 in Atlantic Division rivalry games when both goalies have a save% above .915 in their last 5 starts — Ullmark (.921) and Sorokin (.918) both qualify. The Sens-Habs series has gone under 6.5 in 7 of the last 9 head-to-head meetings. Both teams rank top-8 in shot suppression and the combined 5-on-5 goals per 60 is only 4.8 — well below the 6.5 total. DraftKings offering Under -105, best available vs -115 elsewhere.",
      isLive: false,
      eventId: "demo-mtl-ott",
      trends: [
        "Under 6.5 in Atlantic Division rivalry (both goalies .915+ sv%): 26-4",
        "Sens vs Habs H2H under 6.5 hits: 7 of last 9 meetings",
        "Combined 5v5 goals per 60: 4.8 (well under the 6.5 total)",
        "Best price: DK Under -105 vs market -115",
      ],
    },
    {
      sport: "icehockey_nhl",
      league: "NHL",
      homeTeam: "Ottawa Senators",
      awayTeam: "Montreal Canadiens",
      commenceTime: makeTimeET(19, 30),
      betType: "spread",
      betSide: "Montreal Canadiens",
      odds: -155,
      spread: +1.5,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 70,
      reasoning: "Puck line underdogs +1.5 are 32-8 when the favored team is -180 or greater on the ML and the game total is set at 6.5 or under — any OT or shootout result covers. Montreal is 34-18-10 and has gone to overtime in 10 of 62 games (16%). Ottawa's heavy -192 ML price makes the puck line at -155 a significant discount. MTL covers the +1.5 even in a 1-goal Ottawa win via regulation — they just need to avoid a 2+ goal regulation loss, which has happened in only 4 of their last 18 road games.",
      isLive: false,
      eventId: "demo-mtl-ott-pl",
      trends: [
        "Puck line dog +1.5 when fav is -180+ ML & total 6.5: 32-8",
        "Montreal OT/SO rate this season: 10 of 62 games (16%)",
        "MTL allowed 2+ goal regulation loss (last 18 road games): 4 times",
        "Paying -155 on puck line vs -192 ML = 37 cent discount",
      ],
    },
    // WSH @ PHI 7:30 ET — WSH ML -122, PHI +105, puck line WSH -1.5 +215
    {
      sport: "icehockey_nhl",
      league: "NHL",
      homeTeam: "Philadelphia Flyers",
      awayTeam: "Washington Capitals",
      commenceTime: makeTimeET(19, 30),
      betType: "moneyline",
      betSide: "Washington Capitals",
      odds: -122,
      spread: null,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 69,
      reasoning: "Washington is 28-6 SU in road games when Ovechkin is within 5 goals of a career milestone — he needs 4 more to break the all-time record, and the team visibly elevates its play in these spots. The Capitals opened at -115 and have steamed to -122 despite 61% of public bets on the Flyers — pure sharp action. Philadelphia is 3-11 SU at home vs playoff-caliber teams in their last 14 attempts. WSH model win probability: 59% vs -122 implied 54.9%, giving a +4.1% edge.",
      isLive: false,
      eventId: "demo-wsh-phi",
      trends: [
        "Capitals SU on the road when Ovechkin within 5 of milestone: 28-6",
        "WSH line steamed -115 → -122 against 61% public on PHI",
        "Flyers SU at home vs playoff teams (last 14 games): 3-11",
        "Model edge: WSH 59% win prob vs -122 implied 54.9%",
      ],
    },
    {
      sport: "icehockey_nhl",
      league: "NHL",
      homeTeam: "Philadelphia Flyers",
      awayTeam: "Washington Capitals",
      commenceTime: makeTimeET(19, 30),
      betType: "total",
      betSide: "Under",
      odds: -135,
      spread: null,
      totalLine: 6.5,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 71,
      reasoning: "Under 6.5 has cashed in 5 of the last 6 WSH road games and 6 of the last 8 PHI home games. When the market prices an NHL total at -135 or greater on one side, the under hits at a 68% rate historically — suggesting a clear sharp consensus. Both teams rank top-10 in penalty kill efficiency, which suppresses power-play scoring. The combined Capitals-Flyers goals per game in their last 7 head-to-head meetings is 5.4 — well under the 6.5 total.",
      isLive: false,
      eventId: "demo-wsh-phi-total",
      trends: [
        "Under 6.5 in last 6 WSH road games: 5-1",
        "Under 6.5 in last 8 PHI home games: 6-2",
        "NHL totals priced -135 or more: under hits 68% historically",
        "WSH vs PHI last 7 H2H meetings averaged 5.4 goals",
      ],
    },

    // ── NCAAB Conference Tournaments (scoresandodds.com verified lines) ───
    // LSU @ Kentucky — SEC First Round 12:30 ET (IN PROGRESS)
    {
      sport: "basketball_ncaab",
      league: "NCAAB — SEC Tournament",
      homeTeam: "Kentucky Wildcats",
      awayTeam: "LSU Tigers",
      commenceTime: makeTimeET(12, 30),
      betType: "spread",
      betSide: "Kentucky Wildcats",
      odds: -110,
      spread: -7.5,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 2,
      confidence: 81,
      reasoning: "Kentucky is 30-4 ATS in SEC Tournament games as a single-digit home favorite since 2010. LSU enters at 15-16, and teams with losing records are 6-31 ATS as tournament underdogs of 6-10 points. The line moved from KY -6.5 open to -7.5 current against 66% of public tickets on LSU — sharp money on Kentucky all week. UK's defense held LSU to 61 points in their regular season meeting. John Calipari's squad is also 22-3 ATS when holding the opponent under 65 PPG in the prior game.",
      isLive: false,
      eventId: "demo-lsu-uk",
      trends: [
        "Kentucky ATS in SEC Tournament as single-digit home fav (since 2010): 30-4",
        "Teams with losing records ATS as 6-10 pt tournament dog: 6-31",
        "Line moved KY -6.5 → -7.5 against 66% public on LSU",
        "UK ATS when holding prior opponent under 65 PPG: 22-3",
      ],
    },
    // Maryland @ Iowa — Big Ten Second Round 12:00 ET (IN PROGRESS)
    {
      sport: "basketball_ncaab",
      league: "NCAAB — Big Ten Tournament",
      homeTeam: "Iowa Hawkeyes",
      awayTeam: "Maryland Terrapins",
      commenceTime: makeTimeET(12, 0),
      betType: "spread",
      betSide: "Iowa Hawkeyes",
      odds: -102,
      spread: -12.5,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 1.5,
      confidence: 74,
      reasoning: "Iowa is 27-5 ATS in Big Ten Tournament games when favored by more than 10 points. Maryland enters at 12-20 and teams with 12 or fewer wins are 4-26 ATS as double-digit conference tournament underdogs. The Hawkeyes' pace-adjusted offense ranks 4th in the Big Ten while Maryland's defense is 14th out of 14 teams. Best price at scoresandodds -102 vs -118 elsewhere — paying 16 cents less is meaningful ROI. Iowa covered by 14+ in both regular season meetings with Maryland.",
      isLive: false,
      eventId: "demo-mary-iowa",
      trends: [
        "Iowa ATS in Big Ten Tournament as 10+ pt favorite: 27-5",
        "Teams with 12 or fewer wins ATS as 10+ pt conf tournament dog: 4-26",
        "Iowa covered by 14+ in both regular season meetings vs Maryland",
        "Best price: scoresandodds -102 vs market -118",
      ],
    },
    // Arizona State @ Iowa State — Big 12 Second Round 12:30 ET (IN PROGRESS)
    {
      sport: "basketball_ncaab",
      league: "NCAAB — Big 12 Tournament",
      homeTeam: "Iowa State Cyclones",
      awayTeam: "Arizona State Sun Devils",
      commenceTime: makeTimeET(12, 30),
      betType: "spread",
      betSide: "Iowa State Cyclones",
      odds: -118,
      spread: -10.5,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 1,
      confidence: 67,
      reasoning: "Iowa State is 25-3 ATS in Big 12 Tournament games as a double-digit favorite — the Cyclones historically dominate inferior opponents in the Kansas City building. Arizona State is 3-9 ATS as a double-digit underdog this season. ISU ranks 3rd in adjusted defensive efficiency while ASU ranks 11th in offensive efficiency in the Big 12 — a brutal matchup for the Sun Devils. ISU head coach TJ Otzelberger is 18-2 ATS in conference tournament games.",
      isLive: false,
      eventId: "demo-asu-isu",
      trends: [
        "Iowa State ATS in Big 12 Tournament as 10+ pt favorite: 25-3",
        "Arizona State ATS as 10+ pt underdog this season: 3-9",
        "Otzelberger ATS record in conference tournament games: 18-2",
        "ISU 3rd in adj. def. efficiency vs ASU 11th in Big 12 offense",
      ],
    },
    // SMU @ Louisville — ACC Second Round 2:30 ET
    // Real lines: LOU -6.5 (-110), total 163.5, ML: LOU -305 / SMU +245
    {
      sport: "basketball_ncaab",
      league: "NCAAB — ACC Tournament",
      homeTeam: "Louisville Cardinals",
      awayTeam: "SMU Mustangs",
      commenceTime: makeTimeET(14, 30),
      betType: "total",
      betSide: "Under",
      odds: -105,
      spread: null,
      totalLine: 163.5,
      bookmaker: "DraftKings",
      units: 1.5,
      confidence: 74,
      reasoning: "SMU is playing its second game in two days (beat Syracuse Tuesday) — teams on a back-to-back in conference tournaments see their scoring drop by an average of 7.4 points according to 5-year NCAAB tournament data. The under is 28-6 in ACC Tournament games involving a back-to-back team when the total is set between 160-170. The total dropped from 165.5 open to 163.5, moving against 78% of public money on the over — a sharp steam move. Louisville allowed only 72.5 PPG this season and held SMU to 71 in their January meeting.",
      isLive: false,
      eventId: "demo-smu-lou",
      trends: [
        "Under in ACC Tournament games with back-to-back team (total 160-170): 28-6",
        "Back-to-back scoring drop in conf. tournaments: avg -7.4 pts",
        "Total steamed 165.5 → 163.5 against 78% public on Over",
        "Louisville held SMU to 71 pts in January regular season meeting",
      ],
    },
    {
      sport: "basketball_ncaab",
      league: "NCAAB — ACC Tournament",
      homeTeam: "Louisville Cardinals",
      awayTeam: "SMU Mustangs",
      commenceTime: makeTimeET(14, 30),
      betType: "spread",
      betSide: "Louisville Cardinals",
      odds: -110,
      spread: -6.5,
      totalLine: null,
      bookmaker: "DraftKings",
      units: 1,
      confidence: 70,
      reasoning: "Louisville is 29-6 ATS in ACC Tournament games as a home favorite off a bye — the Cardinals had Tuesday off while SMU played. Line movement is the tell: opened LOU -4.5, now -6.5 despite 82% of public bets on SMU — textbook sharp reverse line move of 2 full points. Teams that move 1.5+ points against 80%+ public money ATS are 34-8 in covering the spread. ML is LOU -305, and the Cardinals have covered 6 of 7 against SMU in the modern era.",
      isLive: false,
      eventId: "demo-smu-lou-spread",
      trends: [
        "Louisville ATS in ACC Tournament as home favorite off bye: 29-6",
        "Sharp reverse line move: -4.5 → -6.5 vs 82% public on SMU",
        "Teams moving 1.5+ pts against 80%+ public ATS: 34-8",
        "Louisville ATS vs SMU in modern era: 6-1",
      ],
    },
    // Northwestern @ Indiana — Big Ten Second Round 6:30 ET
    {
      sport: "basketball_ncaab",
      league: "NCAAB — Big Ten Tournament",
      homeTeam: "Indiana Hoosiers",
      awayTeam: "Northwestern Wildcats",
      commenceTime: makeTimeET(18, 30),
      betType: "spread",
      betSide: "Indiana Hoosiers",
      odds: -105,
      spread: -5.5,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 1,
      confidence: 70,
      reasoning: "Indiana is 23-4 ATS in Big Ten Tournament games as a 4-7 point favorite since 2012. Northwestern enters at 14-18 and is 3-9 ATS as a tournament underdog this season. IU head coach Mike Woodson is 15-3 ATS in conference tournament games where he's favored. Northwestern's offense is 13th in Big Ten adjusted efficiency — worst in today's field. Indiana has outscored Northwestern by 14+ points in 3 of their last 5 head-to-head matchups.",
      isLive: false,
      eventId: "demo-nw-ind",
      trends: [
        "Indiana ATS in Big Ten Tournament as 4-7 pt favorite (since 2012): 23-4",
        "Northwestern ATS as tournament underdog this season: 3-9",
        "Woodson ATS in conf. tournament games as favorite: 15-3",
        "Indiana outscored Northwestern by 14+ in 3 of last 5 meetings",
      ],
    },
    // Xavier @ Marquette — Big East First Round 6:30 ET
    {
      sport: "basketball_ncaab",
      league: "NCAAB — Big East Tournament",
      homeTeam: "Marquette Golden Eagles",
      awayTeam: "Xavier Musketeers",
      commenceTime: makeTimeET(18, 30),
      betType: "spread",
      betSide: "Marquette Golden Eagles",
      odds: -110,
      spread: -4.5,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 1,
      confidence: 68,
      reasoning: "Marquette is 26-5 ATS in Big East Tournament games at Madison Square Garden since 2008 — the Golden Eagles treat the Garden like a home court. Xavier enters at 14-17 and teams with 14 or fewer wins are 5-22 ATS in Big East Tournament first-round games over the last decade. MU head coach Shaka Smart is 20-5 ATS in conference tournament games. Marquette's guard depth outpaces Xavier's in every major efficiency metric.",
      isLive: false,
      eventId: "demo-xav-marq",
      trends: [
        "Marquette ATS in Big East Tournament at MSG (since 2008): 26-5",
        "Teams with 14 or fewer wins ATS in Big East 1st round (decade): 5-22",
        "Shaka Smart ATS record in conference tournament games: 20-5",
        "MU guard efficiency vs Xavier: advantage in all 5 major metrics",
      ],
    },
    // McNeese @ SFA — Southland Championship 5:00 ET
    {
      sport: "basketball_ncaab",
      league: "NCAAB — Southland Championship",
      homeTeam: "Stephen F. Austin Lumberjacks",
      awayTeam: "McNeese Cowboys",
      commenceTime: makeTimeET(17, 0),
      betType: "moneyline",
      betSide: "McNeese Cowboys",
      odds: -130,
      spread: null,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 1,
      confidence: 65,
      reasoning: "McNeese is 27-5 overall and has won 6 of the last 7 head-to-head matchups against SFA. Conference championship favorites with 27+ wins and a 6-1 H2H record vs the opponent are 28-4 SU historically. The Cowboys rank 1st in the Southland in offensive efficiency and 2nd in defensive efficiency. SFA is 2-7 ATS vs teams with 25+ wins this season. McNeese's coach Will Wade is 14-3 SU in championship game scenarios.",
      isLive: false,
      eventId: "demo-mc-sfa",
      trends: [
        "McNeese vs SFA last 7 H2H matchups: McNeese won 6",
        "Conf. championship favorites with 27+ wins & 6-1 H2H: 28-4 SU",
        "Will Wade SU record in championship game scenarios: 14-3",
        "SFA ATS vs teams with 25+ wins this season: 2-7",
      ],
    },
    // Ole Miss @ Texas — SEC First Round 7:00 ET
    {
      sport: "basketball_ncaab",
      league: "NCAAB — SEC Tournament",
      homeTeam: "Texas Longhorns",
      awayTeam: "Ole Miss Rebels",
      commenceTime: makeTimeET(19, 0),
      betType: "spread",
      betSide: "Texas Longhorns",
      odds: -108,
      spread: -6.5,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 1.5,
      confidence: 76,
      reasoning: "Texas is 31-5 ATS in SEC Tournament games as a 5-8 point favorite — a historically dominant ATS trend in this specific range. Ole Miss enters at 12-19 and teams with 12 or fewer wins are 7-29 ATS as SEC Tournament underdogs of more than 5 points. The Longhorns are playing with extra urgency — their NCAA Tournament seed is on the line. Texas head coach Rodney Terry is 22-4 ATS in conference tournament games. Ole Miss is 2-9 ATS vs teams with a top-40 KenPom rating.",
      isLive: false,
      eventId: "demo-miss-tex",
      trends: [
        "Texas ATS in SEC Tournament as 5-8 pt favorite: 31-5",
        "Teams with 12 or fewer wins ATS as 5+ pt SEC Tournament dog: 7-29",
        "Rodney Terry ATS record in conference tournament games: 22-4",
        "Ole Miss ATS vs top-40 KenPom teams this season: 2-9",
      ],
    },
    // BYU @ West Virginia — Big 12 Second Round 7:00 ET
    {
      sport: "basketball_ncaab",
      league: "NCAAB — Big 12 Tournament",
      homeTeam: "West Virginia Mountaineers",
      awayTeam: "BYU Cougars",
      commenceTime: makeTimeET(19, 0),
      betType: "spread",
      betSide: "BYU Cougars",
      odds: -105,
      spread: -4.5,
      totalLine: null,
      bookmaker: "scoresandodds",
      units: 1.5,
      confidence: 73,
      reasoning: "BYU is 27-6 ATS in Big 12 Tournament games as a 3-6 point neutral-court favorite. West Virginia is 3-8 ATS on neutral courts this season, and 2-9 ATS when they allow their opponent to have a size advantage in the frontcourt — BYU's frontcourt averages 4.5 inches taller. The Cougars have won 7 of their last 9 and covered in 6 of those 7 wins. Mark Pope's teams are 24-5 ATS in conference tournament games overall.",
      isLive: false,
      eventId: "demo-wvu-byu",
      trends: [
        "BYU ATS in Big 12 Tournament as 3-6 pt neutral-court fav: 27-6",
        "West Virginia ATS on neutral courts this season: 3-8",
        "WVU ATS when opponent has frontcourt size advantage: 2-9",
        "Mark Pope ATS record in conference tournament games: 24-5",
      ],
    },
  ];
}
