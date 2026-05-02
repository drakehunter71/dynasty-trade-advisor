import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  SleeperUser,
  SleeperLeague,
  SleeperTradedPick,
  SleeperRoster,
  SleeperLeagueUser,
  SleeperPlayerData,
} from '../../src/types.js';

// We stub global fetch before importing the module under test
// so the module picks up the stub at call time (not at import time).

const makeFetchStub = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

describe('fetchSleeperUser', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('returns the user object on success', async () => {
    const user: SleeperUser = {
      user_id: '123',
      username: 'drakesmith',
      display_name: 'Drake',
    };
    vi.stubGlobal('fetch', makeFetchStub(200, user));

    const { fetchSleeperUser } = await import('../../src/fetchers/sleeper.js');
    const result = await fetchSleeperUser('drakesmith');
    expect(result).toEqual(user);
  });

  it('throws on a 404 response', async () => {
    vi.stubGlobal('fetch', makeFetchStub(404, null));

    const { fetchSleeperUser } = await import('../../src/fetchers/sleeper.js');
    await expect(fetchSleeperUser('nobody')).rejects.toThrow('Sleeper API error: 404');
  });
});

describe('fetchDynastyLeagues', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('filters out non-dynasty leagues (type !== 2)', async () => {
    const leagues: SleeperLeague[] = [
      {
        league_id: 'dyn1',
        name: 'Dynasty League',
        season: '2024',
        status: 'in_season',
        settings: { type: 2 },
        scoring_settings: { rec: 1 },
        roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      },
      {
        league_id: 'red1',
        name: 'Redraft League',
        season: '2024',
        status: 'in_season',
        settings: { type: 0 },
        scoring_settings: { rec: 0.5 },
        roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      },
      {
        league_id: 'kee1',
        name: 'Keeper League',
        season: '2024',
        status: 'in_season',
        settings: { type: 1 },
        scoring_settings: { rec: 1 },
        roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      },
    ];
    vi.stubGlobal('fetch', makeFetchStub(200, leagues));

    const { fetchDynastyLeagues } = await import('../../src/fetchers/sleeper.js');
    const result = await fetchDynastyLeagues('user123', '2024');
    expect(result).toHaveLength(1);
    expect(result[0].league_id).toBe('dyn1');
  });

  it('returns empty array when no dynasty leagues exist', async () => {
    vi.stubGlobal('fetch', makeFetchStub(200, []));

    const { fetchDynastyLeagues } = await import('../../src/fetchers/sleeper.js');
    const result = await fetchDynastyLeagues('user123', '2024');
    expect(result).toEqual([]);
  });
});

describe('fetchTradedPicks', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('returns the traded picks array', async () => {
    const picks: SleeperTradedPick[] = [
      { season: '2025', round: 1, roster_id: 3, previous_owner_id: 2, owner_id: 1 },
      { season: '2025', round: 2, roster_id: 5, previous_owner_id: 5, owner_id: 2 },
    ];
    vi.stubGlobal('fetch', makeFetchStub(200, picks));

    const { fetchTradedPicks } = await import('../../src/fetchers/sleeper.js');
    const result = await fetchTradedPicks('league123');
    expect(result).toEqual(picks);
  });

  it('returns an empty array when there are no traded picks', async () => {
    vi.stubGlobal('fetch', makeFetchStub(200, []));

    const { fetchTradedPicks } = await import('../../src/fetchers/sleeper.js');
    const result = await fetchTradedPicks('league123');
    expect(result).toEqual([]);
  });
});

describe('buildLeagueData', () => {
  beforeEach(() => vi.unstubAllGlobals());

  const league: SleeperLeague = {
    league_id: 'league1',
    name: 'Test Dynasty',
    season: '2024',
    status: 'in_season',
    settings: { type: 2 },
    scoring_settings: { rec: 1, bonus_rec_te: 0.5 },
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'],
  };

  const rosters: SleeperRoster[] = [
    { roster_id: 1, owner_id: 'user1', players: ['p1', 'p2'], reserve: null, taxi: null },
    { roster_id: 2, owner_id: 'user2', players: ['p3'], reserve: null, taxi: null },
    { roster_id: 3, owner_id: null, players: [], reserve: null, taxi: null },
  ];

  const users: SleeperLeagueUser[] = [
    { user_id: 'user1', display_name: 'Alice', metadata: { team_name: 'Team Alice' } },
    { user_id: 'user2', display_name: 'Bob', metadata: {} },
  ];

  const tradedPicks: SleeperTradedPick[] = [];

  const allPlayers: Record<string, SleeperPlayerData> = {
    p1: { player_id: 'p1', full_name: 'Patrick Mahomes', position: 'QB', team: 'KC', age: 28, years_exp: 6 },
    p2: { player_id: 'p2', full_name: 'Travis Kelce', position: 'TE', team: 'KC', age: 34, years_exp: 11 },
    p3: { player_id: 'p3', full_name: 'Justin Jefferson', position: 'WR', team: 'MIN', age: 25, years_exp: 4 },
    p4: { player_id: 'p4', full_name: 'Some Punter', position: 'P', team: 'DAL', age: 30, years_exp: 5 },
    p5: { player_id: 'p5', full_name: 'No Position Player', position: undefined, team: 'FA', age: 22, years_exp: 0 },
  };

  function makeMultiFetchStub(
    rostersBody: unknown,
    usersBody: unknown,
    tradedPicksBody: unknown,
  ) {
    let callCount = 0;
    return vi.fn().mockImplementation(() => {
      callCount++;
      const bodies = [rostersBody, usersBody, tradedPicksBody];
      const body = bodies[callCount - 1] ?? [];
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
  }

  it('assembles League with correct id, name, and season from SleeperLeague', async () => {
    vi.stubGlobal('fetch', makeMultiFetchStub(rosters, users, tradedPicks));

    const { buildLeagueData } = await import('../../src/fetchers/sleeper.js');
    const result = await buildLeagueData(league, 'user1', allPlayers);

    expect(result.id).toBe('league1');
    expect(result.name).toBe('Test Dynasty');
    expect(result.season).toBe('2024');
  });

  it('sets myRosterId to the roster where owner_id matches userId', async () => {
    vi.stubGlobal('fetch', makeMultiFetchStub(rosters, users, tradedPicks));

    const { buildLeagueData } = await import('../../src/fetchers/sleeper.js');
    const result = await buildLeagueData(league, 'user1', allPlayers);

    expect(result.myRosterId).toBe(1);
  });

  it('defaults myRosterId to -1 when no roster matches userId', async () => {
    vi.stubGlobal('fetch', makeMultiFetchStub(rosters, users, tradedPicks));

    const { buildLeagueData } = await import('../../src/fetchers/sleeper.js');
    const result = await buildLeagueData(league, 'user-unknown', allPlayers);

    expect(result.myRosterId).toBe(-1);
  });

  it('builds roster players from allPlayers for valid positions only', async () => {
    const rostersWithExtras: SleeperRoster[] = [
      { roster_id: 1, owner_id: 'user1', players: ['p1', 'p2', 'p4', 'p5'], reserve: null, taxi: null },
    ];
    vi.stubGlobal('fetch', makeMultiFetchStub(rostersWithExtras, users, tradedPicks));

    const { buildLeagueData } = await import('../../src/fetchers/sleeper.js');
    const result = await buildLeagueData(league, 'user1', allPlayers);

    const team1 = result.teams.find((t) => t.rosterId === 1)!;
    const playerIds = team1.roster.map((rp) => rp.player.sleeperId);

    // QB and TE are valid; P and undefined position are not
    expect(playerIds).toContain('p1');
    expect(playerIds).toContain('p2');
    expect(playerIds).not.toContain('p4');
    expect(playerIds).not.toContain('p5');
  });

  it('gives orphan rosters (owner_id: null) a fallback ownerName starting with "Roster"', async () => {
    vi.stubGlobal('fetch', makeMultiFetchStub(rosters, users, tradedPicks));

    const { buildLeagueData } = await import('../../src/fetchers/sleeper.js');
    const result = await buildLeagueData(league, 'user1', allPlayers);

    const orphanTeam = result.teams.find((t) => t.rosterId === 3)!;
    expect(orphanTeam.ownerName).toMatch(/^Roster/);
  });
});
