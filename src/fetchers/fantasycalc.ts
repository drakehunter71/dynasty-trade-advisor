import type { CalcPlayerValue } from '../types.js';

interface FantasyCalcResponse {
  player: { name: string; sleeperId?: string; maybeSleeperId?: string; position: string };
  value: number;
}

export async function fetchFantasyCalcValues(isSuperflex: boolean): Promise<CalcPlayerValue[]> {
  // API changed: isSuperflex replaced with numQbs (1 = 1QB, 2 = superflex)
  const numQbs = isSuperflex ? 2 : 1;
  const url = `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${numQbs}`;
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
  return data.map((e) => {
    // API changed: maybeSleeperId → sleeperId (keep fallback for older responses)
    const id = e.player.sleeperId ?? e.player.maybeSleeperId;
    return {
      name: e.player.name,
      ...(id ? { sleeperId: id } : {}),
      value: e.value,
    };
  });
}
