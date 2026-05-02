import type { RosterPlayer, DraftPick, WinWindow } from './types.js';

const ELITE_THRESHOLD = 75;
const TOP_N_STARTERS = 8;

export function inferWinWindow(roster: RosterPlayer[], picks: DraftPick[]): WinWindow {
  if (roster.length === 0) return 'rebuilding';

  const top = [...roster]
    .sort((a, b) => b.values.normalized - a.values.normalized)
    .slice(0, TOP_N_STARTERS);

  const avgAge = top.reduce((sum, p) => sum + p.player.age, 0) / top.length;
  const eliteCount = top.filter((p) => p.values.normalized >= ELITE_THRESHOLD).length;
  const currentYear = new Date().getFullYear();
  const futureFirsts = picks.filter(
    (p) => p.round === 1 && parseInt(p.season) > currentYear
  ).length;

  if (futureFirsts >= 3) return 'rebuilding';
  if (avgAge < 22) return 'rebuilding';
  if (avgAge >= 28 && eliteCount >= 3) return 'win-now';
  if (avgAge >= 25 && eliteCount >= 2) return 'contending';
  return 'developing';
}
