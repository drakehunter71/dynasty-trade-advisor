import type { CalcPlayerValue } from '../types.js';

interface KtcRawPlayer {
  playerName: string;
  position: string;
  // KTC changed structure: value is now nested under oneQBValues or superflexValues
  oneQBValues?: { value: number };
  superflexValues?: { value: number };
  // Legacy field (no longer present)
  sleeperPlayerID?: string;
  value?: number;
}

export function parseKtcHtml(html: string, isSuperflex = false): CalcPlayerValue[] {
  // KTC renamed variable: playerValues → oneQBPlayers / superflexPlayers
  const varName = isSuperflex ? 'superflexPlayers' : 'oneQBPlayers';
  const pattern = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
  const match = html.match(pattern);
  if (!match) return [];
  let data: KtcRawPlayer[];
  try {
    data = JSON.parse(match[1]) as KtcRawPlayer[];
  } catch {
    return [];
  }
  return data
    .map((p) => {
      const value = isSuperflex
        ? p.superflexValues?.value
        : p.oneQBValues?.value ?? p.value;
      if (value === undefined || value === 0) return null;
      return {
        name: p.playerName,
        ...(p.sleeperPlayerID ? { sleeperId: p.sleeperPlayerID } : {}),
        value,
      };
    })
    .filter((p): p is CalcPlayerValue => p !== null);
}

export async function fetchAllKtcVariants(): Promise<{ oneQB: CalcPlayerValue[]; superflex: CalcPlayerValue[] }> {
  const [oneQB, superflex] = await Promise.all([
    fetchKtcValues(false),
    fetchKtcValues(true),
  ]);
  console.log(`KTC: 1QB=${oneQB.length}, SF=${superflex.length}`);
  return { oneQB, superflex };
}

export async function fetchKtcValues(isSuperflex = false): Promise<CalcPlayerValue[]> {
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
  const values = parseKtcHtml(html, isSuperflex);
  if (values.length === 0) {
    console.warn('KTC: parsed 0 players — page structure may have changed. Check src/fetchers/keeptradecut.ts');
  }
  return values;
}
