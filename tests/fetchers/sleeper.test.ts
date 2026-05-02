import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SleeperUser, SleeperLeague, SleeperTradedPick } from '../../src/types.js';

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
        settings: { type: 2, rec: 1 },
        roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      },
      {
        league_id: 'red1',
        name: 'Redraft League',
        season: '2024',
        status: 'in_season',
        settings: { type: 0, rec: 0.5 },
        roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      },
      {
        league_id: 'kee1',
        name: 'Keeper League',
        season: '2024',
        status: 'in_season',
        settings: { type: 1, rec: 1 },
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
