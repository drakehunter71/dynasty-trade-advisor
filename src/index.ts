import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchSleeperUser, fetchDynastyLeagues, fetchAllPlayers, buildLeagueData } from './fetchers/sleeper.js';
import { fetchFantasyCalcValues } from './fetchers/fantasycalc.js';
import { fetchKtcValues } from './fetchers/keeptradecut.js';
import { fetchDynastyProcessValues } from './fetchers/dynastyprocess.js';
import { resolvePlayerValues } from './normalize.js';
import { inferWinWindow } from './win-window.js';
import { formatSnapshot } from './format-summary.js';
import { buildLeagueState } from './format-league-state.js';
import type { Snapshot, CalcPlayerValue, DraftPick } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const OVERRIDE_FILE = path.join(__dirname, '..', 'picks-override.json');

type PicksOverride = Record<string, Record<string, DraftPick[]>>;

function loadPicksOverride(): PicksOverride {
  if (!fs.existsSync(OVERRIDE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8')) as PicksOverride;
  } catch {
    console.warn('picks-override.json is invalid JSON — skipping overrides');
    return {};
  }
}

function applyPicksOverrides(leagueData: import('./types.js').League[], overrides: PicksOverride): void {
  for (const league of leagueData) {
    const leagueOverride = overrides[league.name];
    if (!leagueOverride) continue;
    for (const team of league.teams) {
      const teamOverride = leagueOverride[team.ownerName];
      if (!teamOverride) continue;
      team.picks = teamOverride;
      console.log(`  Applied picks override for ${team.ownerName} in ${league.name}`);
    }
  }
}

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
    fetchKtcValues(anySuperflex),
    fetchDynastyProcessValues(anySuperflex),
  ]);

  const valueSources: string[] = [];
  if (fcValues.length > 0) valueSources.push('FantasyCalc');
  if (ktcValues.length > 0) valueSources.push('KTC');
  if (dpValues.length > 0) valueSources.push('DynastyProcess');

  console.log(`Value sources loaded: ${valueSources.join(', ') || 'none (all sources failed)'}`);

  if (valueSources.length === 0) {
    console.warn('Warning: all value sources failed. Output will have normalized:0 for all players — not useful for trade analysis.');
    // Don't exit — still write the snapshot so the user knows their leagues loaded
  }

  const sourceDefs: { name: string; players: CalcPlayerValue[] }[] = [
    { name: 'fantasyCalc', players: fcValues },
    { name: 'ktc', players: ktcValues },
    { name: 'dynastyProcess', players: dpValues },
  ];

  console.log('Building league snapshots...');
  const leagueData = await Promise.all(
    dynastyLeagues.map((l) => buildLeagueData(l, user.user_id, allPlayers))
  );

  const picksOverride = loadPicksOverride();
  if (Object.keys(picksOverride).some(k => k !== '_comment')) {
    console.log('Applying picks overrides...');
    applyPicksOverrides(leagueData, picksOverride);
  }

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

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
  console.log('Wrote data/snapshot.json');

  const summary = formatSnapshot(snapshot);
  fs.writeFileSync(path.join(DATA_DIR, 'summary.md'), summary);
  console.log('Wrote data/snapshot.json');

  const leagueState = buildLeagueState(snapshot);
  fs.writeFileSync(path.join(DATA_DIR, 'league-state.md'), leagueState);
  console.log('Wrote data/league-state.md');

  console.log('\nDone. Load data/league-state.md into Claude Code context for trade analysis.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
