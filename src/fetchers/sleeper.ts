import type {
  SleeperUser,
  SleeperLeague,
  SleeperRoster,
  SleeperLeagueUser,
  SleeperPlayerData,
  SleeperTradedPick,
  Player,
  DraftPick,
  Team,
  League,
  ScoringFormat,
  Position,
} from '../types.js';

const BASE = 'https://api.sleeper.app/v1';

const VALID_POSITIONS = new Set<string>(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

const DEFAULT_PICK_ROUNDS = [1, 2, 3];
const DEFAULT_SEASON_OFFSETS = [0, 1, 2];

async function sleeperGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Sleeper API error: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSleeperUser(username: string): Promise<SleeperUser> {
  return sleeperGet<SleeperUser>(`/user/${username}`);
}

export async function fetchDynastyLeagues(
  userId: string,
  season: string,
): Promise<SleeperLeague[]> {
  const leagues = await sleeperGet<SleeperLeague[]>(
    `/user/${userId}/leagues/nfl/${season}`,
  );
  return leagues.filter((l) => l.settings.type === 2);
}

export async function fetchLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  return sleeperGet<SleeperRoster[]>(`/league/${leagueId}/rosters`);
}

export async function fetchLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
  return sleeperGet<SleeperLeagueUser[]>(`/league/${leagueId}/users`);
}

export async function fetchAllPlayers(): Promise<Record<string, SleeperPlayerData>> {
  return sleeperGet<Record<string, SleeperPlayerData>>('/players/nfl');
}

export async function fetchTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
  return sleeperGet<SleeperTradedPick[]>(`/league/${leagueId}/traded_picks`);
}

function detectScoringFormat(league: SleeperLeague): ScoringFormat {
  const rec = league.scoring_settings?.rec ?? 0;
  if (rec === 1) return 'ppr';
  if (rec === 0.5) return 'half_ppr';
  return 'standard';
}

function detectSuperflex(league: SleeperLeague): boolean {
  return league.roster_positions.includes('SUPER_FLEX');
}

function detectTePremium(league: SleeperLeague): { tePremium: boolean; tePremiumAmount: number } {
  const amount = league.scoring_settings?.bonus_rec_te ?? 0;
  return { tePremium: amount > 0, tePremiumAmount: amount };
}

function buildPicksPerRoster(
  rosters: SleeperRoster[],
  tradedPicks: SleeperTradedPick[],
  rosterIdToOwner: Map<number, { name: string; teamName: string }>,
  leagueSeason: number,
): Map<number, DraftPick[]> {
  // Use the later of leagueSeason vs wall-clock year so seeding always matches win-window.ts's filter.
  const currentYear = Math.max(leagueSeason, new Date().getFullYear());

  // ownership map: `${season}-${round}-${originalRosterId}` → { currentOwnerRosterId }
  const ownershipMap = new Map<string, { currentOwnerRosterId: number }>();

  // Step 1: Seed default picks — every roster owns rounds 1-3 for current year, +1, +2.
  for (const roster of rosters) {
    for (const offset of DEFAULT_SEASON_OFFSETS) {
      const season = String(currentYear + offset);
      for (const round of DEFAULT_PICK_ROUNDS) {
        const key = `${season}-${round}-${roster.roster_id}`;
        ownershipMap.set(key, { currentOwnerRosterId: roster.roster_id });
      }
    }
  }

  // Step 2: Apply traded picks.
  // roster_id = current owner, owner_id = original owner (whose pick year/round it is).
  for (const pick of tradedPicks) {
    const key = `${pick.season}-${pick.round}-${pick.owner_id}`;
    // If the key exists (within default window) update it; if not (future pick outside window) add it.
    ownershipMap.set(key, { currentOwnerRosterId: pick.roster_id });
  }

  // Step 3: Group by current owner into DraftPick objects.
  const picksPerRoster = new Map<number, DraftPick[]>();

  for (const [key, { currentOwnerRosterId }] of ownershipMap) {
    const [season, roundStr, originalRosterIdStr] = key.split('-');
    const round = Number(roundStr);
    const originalRosterId = Number(originalRosterIdStr);

    const originalOwnerInfo = rosterIdToOwner.get(originalRosterId);
    const currentOwnerInfo = rosterIdToOwner.get(currentOwnerRosterId);

    const originalOwnerName = originalOwnerInfo?.name ?? `Roster ${originalRosterId}`;
    const currentOwnerName = currentOwnerInfo?.name ?? `Roster ${currentOwnerRosterId}`;

    const pick: DraftPick = {
      season,
      round,
      originalOwnerName,
      currentOwnerName,
      currentOwnerRosterId,
    };

    const existing = picksPerRoster.get(currentOwnerRosterId);
    if (existing) {
      existing.push(pick);
    } else {
      picksPerRoster.set(currentOwnerRosterId, [pick]);
    }
  }

  return picksPerRoster;
}

function toPlayer(sleeperId: string, data: SleeperPlayerData): Player | null {
  if (!data.position || !VALID_POSITIONS.has(data.position)) return null;

  const name =
    data.full_name ??
    ([data.first_name, data.last_name].filter(Boolean).join(' ') || sleeperId);

  return {
    sleeperId,
    name,
    position: data.position as Position,
    nflTeam: data.team ?? 'FA',
    age: data.age ?? 0,
    yearsExp: data.years_exp ?? 0,
  };
}

export async function buildLeagueData(
  league: SleeperLeague,
  myUserId: string,
  allPlayers: Record<string, SleeperPlayerData>,
): Promise<League> {
  // Step 1: Parallel fetches.
  const [rosters, users, tradedPicks] = await Promise.all([
    fetchLeagueRosters(league.league_id),
    fetchLeagueUsers(league.league_id),
    fetchTradedPicks(league.league_id),
  ]);

  // Step 2: Build lookup maps.
  const userMap = new Map<string, SleeperLeagueUser>();
  for (const user of users) {
    userMap.set(user.user_id, user);
  }

  const rosterIdToOwner = new Map<number, { name: string; teamName: string }>();
  for (const roster of rosters) {
    const ownerId = roster.owner_id;
    if (ownerId === null) continue;
    const user = userMap.get(ownerId);
    rosterIdToOwner.set(roster.roster_id, {
      name: user?.display_name ?? `Roster ${roster.roster_id}`,
      teamName: user?.metadata?.team_name ?? user?.display_name ?? `Roster ${roster.roster_id}`,
    });
  }

  // Step 3: Build picks per roster.
  const picksPerRoster = buildPicksPerRoster(rosters, tradedPicks, rosterIdToOwner, parseInt(league.season, 10));

  // Step 4: Find my roster ID.
  const myRoster = rosters.find((r) => r.owner_id === myUserId);
  const myRosterId = myRoster?.roster_id ?? -1;

  // Step 5: Map rosters to Teams.
  const teams: Team[] = rosters.map((roster) => {
    const ownerId = roster.owner_id ?? '';
    const ownerInfo = rosterIdToOwner.get(roster.roster_id);

    const playerIds = [...(roster.players ?? []), ...(roster.taxi ?? [])];
    const rosterPlayers = playerIds
      .map((id) => {
        const data = allPlayers[id];
        if (!data) return null;
        const player = toPlayer(id, data);
        if (!player) return null;
        return { player, values: { normalized: 0 } };
      })
      .filter((rp): rp is NonNullable<typeof rp> => rp !== null);

    return {
      rosterId: roster.roster_id,
      ownerId,
      ownerName: ownerInfo?.name ?? `Roster ${roster.roster_id}`,
      teamName: ownerInfo?.teamName ?? `Roster ${roster.roster_id}`,
      roster: rosterPlayers,
      picks: picksPerRoster.get(roster.roster_id) ?? [],
      winWindow: 'developing',
      totalRosterValue: 0,
    };
  });

  const { tePremium, tePremiumAmount } = detectTePremium(league);

  return {
    id: league.league_id,
    name: league.name,
    season: league.season,
    scoringFormat: detectScoringFormat(league),
    isSuperflex: detectSuperflex(league),
    tePremium,
    tePremiumAmount,
    teams,
    myRosterId,
  };
}
