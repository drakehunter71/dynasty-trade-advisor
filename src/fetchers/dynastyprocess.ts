import type { CalcPlayerValue } from '../types.js';

function parseDynastyProcessCsv(csv: string, isSuperflex: boolean): CalcPlayerValue[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const nameIdx = headers.indexOf('fp_player_name');
  const valueKey = isSuperflex ? 'Value.Superflex' : 'Value.1QB';
  const valueIdx = headers.indexOf(valueKey);
  if (nameIdx === -1 || valueIdx === -1) {
    console.warn(`Dynasty Process CSV missing expected columns. Found: ${headers.join(', ')}`);
    return [];
  }
  return lines.slice(1).flatMap((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
    const name = cols[nameIdx];
    const rawValue = parseFloat(cols[valueIdx] ?? '');
    if (!name || isNaN(rawValue)) return [];
    return [{ name, value: rawValue }];
  });
}

export async function fetchDynastyProcessValues(isSuperflex: boolean): Promise<CalcPlayerValue[]> {
  const urls = [
    'https://dynastyprocess.com/api/export.csv',
    'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playervalues.csv',
  ];
  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const csv = await res.text();
    const values = parseDynastyProcessCsv(csv, isSuperflex);
    if (values.length > 0) return values;
  }
  console.warn('Dynasty Process: all endpoints failed or returned empty data — skipping');
  return [];
}
