import type { CalcPlayerValue } from '../types.js';

export type DynastyNerdsVariant = 'PPR' | 'SFLEX' | 'STD' | 'SFLEXTEP';

interface DnPlayer {
  firstName: string;
  lastName: string;
  sleeperId?: string;
  value: number;
  pos: string;
}

/**
 * Bracket-counting extractor for embedded JSON objects.
 * More reliable than regex for large nested objects.
 */
function extractJsonObject(html: string, marker: string): string | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function toCalcValues(players: DnPlayer[]): CalcPlayerValue[] {
  return players
    .filter((p) => p.value > 0)
    .map((p) => ({
      name: `${p.firstName} ${p.lastName}`,
      ...(p.sleeperId ? { sleeperId: p.sleeperId } : {}),
      value: p.value,
    }));
}

export async function fetchDynastyNerdsValues(): Promise<Partial<Record<DynastyNerdsVariant, CalcPlayerValue[]>>> {
  const url = 'https://dynastynerds.com/rankings/';
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
  } catch (err) {
    console.warn(`Dynasty Nerds fetch failed (network): ${err}`);
    return {};
  }
  if (!res.ok) {
    console.warn(`Dynasty Nerds returned ${res.status} — skipping`);
    return {};
  }

  const html = await res.text();
  const jsonStr = extractJsonObject(html, 'var DR_DATA = ');
  if (!jsonStr) {
    console.warn('Dynasty Nerds: could not locate DR_DATA in page — structure may have changed');
    return {};
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    console.warn('Dynasty Nerds: failed to parse DR_DATA JSON');
    return {};
  }

  const result: Partial<Record<DynastyNerdsVariant, CalcPlayerValue[]>> = {};
  for (const variant of ['PPR', 'SFLEX', 'STD', 'SFLEXTEP'] as DynastyNerdsVariant[]) {
    const players = raw[variant];
    if (Array.isArray(players)) {
      result[variant] = toCalcValues(players as DnPlayer[]);
    }
  }

  const summary = (Object.entries(result) as [string, CalcPlayerValue[]][])
    .map(([k, v]) => `${k}=${v.length}`)
    .join(', ');
  console.log(`Dynasty Nerds: loaded ${summary || 'nothing'}`);
  return result;
}
