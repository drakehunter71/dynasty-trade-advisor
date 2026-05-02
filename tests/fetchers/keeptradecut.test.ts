import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchKtcValues, parseKtcHtml } from '../../src/fetchers/keeptradecut.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
beforeEach(() => mockFetch.mockReset());

describe('parseKtcHtml', () => {
  it('extracts playerValues from embedded JS variable', () => {
    const html = `<script>var playerValues = [{"playerName":"Justin Jefferson","sleeperPlayerID":"6794","value":9200,"position":"WR"},{"playerName":"Patrick Mahomes","sleeperPlayerID":"4046","value":7100,"position":"QB"}];</script>`;
    const values = parseKtcHtml(html);
    expect(values).toHaveLength(2);
    expect(values[0].name).toBe('Justin Jefferson');
    expect(values[0].sleeperId).toBe('6794');
    expect(values[0].value).toBe(9200);
  });

  it('returns [] when variable not found', () => {
    expect(parseKtcHtml('<html>no data</html>')).toHaveLength(0);
  });

  it('returns [] when JSON is malformed', () => {
    expect(parseKtcHtml('<script>var playerValues = [invalid json];</script>')).toHaveLength(0);
  });
});

describe('fetchKtcValues', () => {
  it('returns parsed values from HTML', async () => {
    const html = `<script>var playerValues = [{"playerName":"CeeDee Lamb","sleeperPlayerID":"6786","value":9000,"position":"WR"}];</script>`;
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
