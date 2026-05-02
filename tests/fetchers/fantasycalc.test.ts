import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFantasyCalcValues } from '../../src/fetchers/fantasycalc.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
beforeEach(() => mockFetch.mockReset());

describe('fetchFantasyCalcValues', () => {
  it('returns player values mapped to CalcPlayerValue', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { player: { name: 'Justin Jefferson', maybeSleeperId: '6794', position: 'WR' }, value: 9500 },
        { player: { name: 'Patrick Mahomes', maybeSleeperId: '4046', position: 'QB' }, value: 7200 },
      ],
    });
    const values = await fetchFantasyCalcValues(false);
    expect(values).toHaveLength(2);
    expect(values[0].name).toBe('Justin Jefferson');
    expect(values[0].sleeperId).toBe('6794');
    expect(values[0].value).toBe(9500);
  });

  it('passes numQbs=2 to URL for superflex', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchFantasyCalcValues(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2'
    );
  });

  it('passes numQbs=1 to URL for 1QB', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchFantasyCalcValues(false);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1'
    );
  });

  it('handles new sleeperId field (not maybeSleeperId)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { player: { name: 'Bijan Robinson', sleeperId: '9509', position: 'RB' }, value: 10994 },
      ],
    });
    const values = await fetchFantasyCalcValues(false);
    expect(values[0].sleeperId).toBe('9509');
  });

  it('returns [] and warns on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const values = await fetchFantasyCalcValues(false);
    expect(values).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FantasyCalc'));
    warnSpy.mockRestore();
  });

  it('returns [] and warns on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network fail'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const values = await fetchFantasyCalcValues(false);
    expect(values).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FantasyCalc'));
    warnSpy.mockRestore();
  });
});
