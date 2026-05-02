import type { CalcPlayerValue } from '../types.js';

interface KtcRawPlayer {
  playerName: string;
  sleeperPlayerID?: string;
  value: number;
  position: string;
}

export function parseKtcHtml(html: string): CalcPlayerValue[] {
  const match = html.match(/var\s+playerValues\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  let data: KtcRawPlayer[];
  try {
    data = JSON.parse(match[1]) as KtcRawPlayer[];
  } catch {
    return [];
  }
  return data.map((p) => ({
    name: p.playerName,
    ...(p.sleeperPlayerID ? { sleeperId: p.sleeperPlayerID } : {}),
    value: p.value,
  }));
}

export async function fetchKtcValues(): Promise<CalcPlayerValue[]> {
  const url = 'https://keeptradecut.com/dynasty-rankings?filters=QB|WR|RB|TE|RDP&format=2&numQBs=1';
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  } catch (err) {
    console.warn(`KTC fetch failed (network): ${err}`);
    return [];
  }
  if (!res.ok) {
    console.warn(`KTC returned ${res.status} — skipping`);
    return [];
  }
  const html = await res.text();
  const values = parseKtcHtml(html);
  if (values.length === 0) {
    console.warn('KTC: parsed 0 players — page structure may have changed. Check src/fetchers/keeptradecut.ts');
  }
  return values;
}
