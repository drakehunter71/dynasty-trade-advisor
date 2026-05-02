import type { CalcPlayerValue } from '../types.js';

export type FantasyProsVariant = 'standard' | 'tep' | 'sf';

const URLS: Record<FantasyProsVariant, string> = {
  standard: 'https://www.fantasypros.com/nfl/rankings/dynasty-overall.php',
  tep: 'https://www.fantasypros.com/nfl/rankings/dynasty-te-premium.php',
  sf: 'https://www.fantasypros.com/nfl/rankings/2qb.php',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
};

interface FpPlayer {
  player_name: string;
  rank_ecr: number;
}

/**
 * Bracket-counting JSON extractor — handles deeply nested objects reliably.
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

async function fetchVariant(variant: FantasyProsVariant): Promise<CalcPlayerValue[]> {
  const url = URLS[variant];
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS });
  } catch (err) {
    console.warn(`FantasyPros (${variant}) fetch failed (network): ${err}`);
    return [];
  }
  if (!res.ok) {
    console.warn(`FantasyPros (${variant}) returned ${res.status} — skipping`);
    return [];
  }

  const html = await res.text();
  const jsonStr = extractJsonObject(html, 'ecrData = ');
  if (!jsonStr) {
    console.warn(`FantasyPros (${variant}): could not locate ecrData — page structure may have changed`);
    return [];
  }

  let data: { players?: FpPlayer[] };
  try {
    data = JSON.parse(jsonStr) as { players?: FpPlayer[] };
  } catch {
    console.warn(`FantasyPros (${variant}): failed to parse ecrData JSON`);
    return [];
  }

  const players = data.players ?? [];
  if (players.length === 0) {
    console.warn(`FantasyPros (${variant}): 0 players parsed`);
    return [];
  }

  // Convert rank to value: rank 1 = total (best), rank N = 1 (worst)
  const total = players.length;
  return players.map((p) => ({
    name: p.player_name,
    value: Math.max(1, total - p.rank_ecr + 1),
  }));
}

export async function fetchAllFantasyProsVariants(): Promise<Partial<Record<FantasyProsVariant, CalcPlayerValue[]>>> {
  const [standard, tep, sf] = await Promise.all([
    fetchVariant('standard'),
    fetchVariant('tep'),
    fetchVariant('sf'),
  ]);

  const result: Partial<Record<FantasyProsVariant, CalcPlayerValue[]>> = {};
  if (standard.length > 0) result.standard = standard;
  if (tep.length > 0) result.tep = tep;
  if (sf.length > 0) result.sf = sf;

  const summary = (Object.entries(result) as [string, CalcPlayerValue[]][])
    .map(([k, v]) => `${k}=${v.length}`)
    .join(', ');
  console.log(`FantasyPros: loaded ${summary || 'nothing'}`);
  return result;
}
