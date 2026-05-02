import 'dotenv/config';
import fs from 'node:fs';
import { fetchSleeperUser, fetchDynastyLeagues, fetchAllPlayers, buildLeagueData } from './fetchers/sleeper.js';
import { fetchFantasyCalcValues } from './fetchers/fantasycalc.js';
import { fetchKtcValues } from './fetchers/keeptradecut.js';
import { fetchDynastyProcessValues } from './fetchers/dynastyprocess.js';
import { resolvePlayerValues } from './normalize.js';
import { inferWinWindow } from './win-window.js';
import { formatSnapshot } from './format-summary.js';
import type { Snapshot, CalcPlayerValue } from './types.js';

const CURRENT_SEASON = String(new Date().getFullYear());

async function main(): Promise<void> {
  const username = process.env.SLEEPER_USERNAME;
  if (!username) throw new Error('SLEEPER_USERNAME not set in .env');

  console.log(`Fetching Sleeper data for ${username}...`);
  const user = await fetchSleeperUser(username);
  const dynastyLeagues = await fetchDynastyLeagues(user.user_id, CURRENT_SEASON);

  if (dynastyLeagues.length === 0) {
    console.log('No dynasty leagues found for this account in ' + CURRENT_SEASON + '.');
    return;
  }

  console.log(`Found ${dynastyLeagues.length} dynasty league(s). Fetching player database...`);
  const allPlayers = await fetchAllPlayers();

  console.log('Fetching trade calculator values...');
  const anySuperflex = dynastyLeagues.some((l) => l.roster_positions.includes('SUPER_FLEX'));

  const [fcValues, ktcValues, dpValues] = await Promise.all([
    fetchFantasyCalcValues(anySuperflex),
    fetchKtcValues(),
    fetchDynastyProcessValues(anySuperflex),
  ]);

  const valueSources: string[] = [];
  if (fcValues.length > 0) valueSources.push('FantasyCalc');
  if (ktcValues.length > 0) valueSources.push('KTC');
  if (dpValues.length > 0) valueSources.push('DynastyProcess');

  console.log(`Value sources loaded: ${valueSources.join(', ') || 'none (all sources failed)'}`);

  const sourceDefs: { name: string; players: CalcPlayerValue[] }[] = [
    { name: 'fantasyCalc', players: fcValues },
    { name: 'ktc', players: ktcValues },
    { name: 'dynastyProcess', players: dpValues },
  ];

  console.log('Building league snapshots...');
  const leagueData = await Promise.all(
    dynastyLeagues.map((l) => buildLeagueData(l, user.user_id, allPlayers))
  );

  for (const league of leagueData) {
    for (const team of league.teams) {
      for (const rp of team.roster) {
        rp.values = resolvePlayerValues(rp.player.sleeperId, rp.player.name, sourceDefs);
      }
      team.totalRosterValue = team.roster.reduce((sum, rp) => sum + rp.values.normalized, 0);
      team.winWindow = inferWinWindow(team.roster, team.picks);
    }
  }

  const snapshot: Snapshot = {
    createdAt: new Date().toISOString(),
    sleeperUsername: username,
    leagues: leagueData,
    valueSources,
  };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/snapshot.json', JSON.stringify(snapshot, null, 2));
  console.log('Wrote data/snapshot.json');

  const summary = formatSnapshot(snapshot);
  fs.writeFileSync('data/summary.md', summary);
  console.log('Wrote data/summary.md');

  console.log('\nDone. Load data/summary.md into Claude Code context for trade analysis.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
