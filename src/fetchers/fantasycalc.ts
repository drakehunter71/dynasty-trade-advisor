import type { CalcPlayerValue } from '../types.js';

interface FantasyCalcResponse {
  player: { name: string; maybeSleeperId?: string; position: string };
  value: number;
}

export async function fetchFantasyCalcValues(isSuperflex: boolean): Promise<CalcPlayerValue[]> {
  const url = `https://api.fantasycalc.com/values/current?isDynasty=true&isSuperflex=${isSuperflex}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    console.warn(`FantasyCalc fetch failed (network): ${err}`);
    return [];
  }
  if (!res.ok) {
    console.warn(`FantasyCalc returned ${res.status} — skipping`);
    return [];
  }
  const data = (await res.json()) as FantasyCalcResponse[];
  return data.map((e) => ({
    name: e.player.name,
    ...(e.player.maybeSleeperId ? { sleeperId: e.player.maybeSleeperId } : {}),
    value: e.value,
  }));
}
