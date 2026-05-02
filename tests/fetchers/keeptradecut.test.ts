import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchKtcValues, parseKtcHtml } from '../../src/fetchers/keeptradecut.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
beforeEach(() => mockFetch.mockReset());

describe('parseKtcHtml', () => {
  it('extracts oneQBPlayers from embedded JS variable', () => {
    const html = `<script>var oneQBPlayers = [{"playerName":"Justin Jefferson","position":"WR","oneQBValues":{"value":9200}},{"playerName":"Patrick Mahomes","position":"QB","oneQBValues":{"value":7100}}];</script>`;
    const values = parseKtcHtml(html);
    expect(values).toHaveLength(2);
    expect(values[0].name).toBe('Justin Jefferson');
    expect(values[0].value).toBe(9200);
  });

  it('extracts superflexPlayers when isSuperflex=true', () => {
    const html = `<script>var superflexPlayers = [{"playerName":"Patrick Mahomes","position":"QB","superflexValues":{"value":9800}}];</script>`;
    const values = parseKtcHtml(html, true);
    expect(values).toHaveLength(1);
    expect(values[0].value).toBe(9800);
  });

  it('returns [] when variable not found', () => {
    expect(parseKtcHtml('<html>no data</html>')).toHaveLength(0);
  });

  it('returns [] when JSON is malformed', () => {
    expect(parseKtcHtml('<script>var oneQBPlayers = [invalid json];</script>')).toHaveLength(0);
  });

  it('filters out players with value 0', () => {
    const html = `<script>var oneQBPlayers = [{"playerName":"Active Player","position":"WR","oneQBValues":{"value":5000}},{"playerName":"Cut Player","position":"WR","oneQBValues":{"value":0}}];</script>`;
    const values = parseKtcHtml(html);
    expect(values).toHaveLength(1);
    expect(values[0].name).toBe('Active Player');
  });
});

describe('fetchKtcValues', () => {
  it('returns parsed values from HTML', async () => {
    const html = `<script>var oneQBPlayers = [{"playerName":"CeeDee Lamb","position":"WR","oneQBValues":{"value":9000}}];</script>`;
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const values = await fetchKtcValues();
    expect(values).toHaveLength(1);
    expect(values[0].name).toBe('CeeDee Lamb');
  });

  it('returns [] and warns on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const values = await fetchKtcValues();
    expect(values).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('KTC'));
    warnSpy.mockRestore();
  });

  it('returns [] and warns on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network fail'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const values = await fetchKtcValues();
    expect(values).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('KTC'));
    warnSpy.mockRestore();
  });
});
