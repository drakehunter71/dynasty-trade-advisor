import type { CalcPlayerValue, TradeValues } from './types.js';

export interface ValueIndex {
  byId: Map<string, CalcPlayerValue>;
  byName: Map<string, CalcPlayerValue>;
  max: number;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv)\s*$/, '')
    .trim();
}

export function buildValueIndex(players: CalcPlayerValue[]): ValueIndex {
  const byId = new Map<string, CalcPlayerValue>();
  const byName = new Map<string, CalcPlayerValue>();
  let max = 0;
  for (const p of players) {
    if (p.value > max) max = p.value;
    if (p.sleeperId) byId.set(p.sleeperId, p);
    byName.set(normalizeName(p.name), p);
  }
  return { byId, byName, max };
}

interface ValueSource {
  name: string;
  players: CalcPlayerValue[];
}

export function resolvePlayerValues(
  sleeperId: string,
  playerName: string,
  sources: ValueSource[]
): TradeValues {
  const resolved: Partial<Record<string, number>> = {};
  const normalized100s: number[] = [];

  for (const source of sources) {
    const index = buildValueIndex(source.players);
    const match = index.byId.get(sleeperId) ?? index.byName.get(normalizeName(playerName));
    if (match && index.max > 0) {
      resolved[source.name] = match.value;
      normalized100s.push(Math.round((match.value / index.max) * 100));
    }
  }

  const avg = normalized100s.length > 0
    ? Math.round(normalized100s.reduce((a, b) => a + b, 0) / normalized100s.length)
    : 0;

  return {
    ...(resolved['fantasyCalc'] !== undefined ? { fantasyCalc: resolved['fantasyCalc'] } : {}),
    ...(resolved['ktc'] !== undefined ? { ktc: resolved['ktc'] } : {}),
    ...(resolved['dynastyProcess'] !== undefined ? { dynastyProcess: resolved['dynastyProcess'] } : {}),
    normalized: avg,
  };
}
