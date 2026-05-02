import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchSleeperUser, fetchDynastyLeagues, fetchAllPlayers, buildLeagueData } from './fetchers/sleeper.js';
import { fetchFantasyCalcValues } from './fetchers/fantasycalc.js';
import { fetchAllKtcVariants } from './fetchers/keeptradecut.js';
import { fetchDynastyProcessValues } from './fetchers/dynastyprocess.js';
import { fetchDynastyNerdsValues } from './fetchers/dynastynerds.js';
import { fetchAllFantasyProsVariants } from './fetchers/fantasypros.js';
import { resolvePlayerValues } from './normalize.js';
import { inferWinWindow } from './win-window.js';
import { formatSnapshot } from './format-summary.js';
import { buildLeagueState } from './format-league-state.js';
import type { Snapshot, League, CalcPlayerValue, DraftPick, SleeperPlayerData, ScoringFormat } from './types.js';
import type { DynastyNerdsVariant } from './fetchers/dynastynerds.js';
import type { FantasyProsVariant } from './fetchers/fantasypros.js';

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

function applyPicksOverrides(leagueData: League[], overrides: PicksOverride): void {
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

/**
 * Extract Sleeper community search rank as a value signal.
 * search_rank is inverted: lower rank = more popular/valuable.
 * We cap at 500 and invert so rank 1 → 499, rank 499 → 1.
 */
const SLEEPER_RANK_CAP = 500;
const VALID_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function extractSleeperRanks(allPlayers: Record<string, SleeperPlayerData>): CalcPlayerValue[] {
  return Object.entries(allPlayers)
    .filter(([, p]) =>
      p.search_rank !== undefined &&
      p.search_rank > 0 &&
      p.search_rank <= SLEEPER_RANK_CAP &&
      p.position !== undefined &&
      VALID_POSITIONS.has(p.position)
    )
    .map(([id, p]) => ({
      sleeperId: id,
      name: p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      value: SLEEPER_RANK_CAP - (p.search_rank as number),
    }))
    .filter((p) => p.name.length > 0);
}

interface AllSources {
  fc1QB: CalcPlayerValue[];
  fcSF: CalcPlayerValue[];
  ktc1QB: CalcPlayerValue[];
  ktcSF: CalcPlayerValue[];
  dynastyNerds: Partial<Record<DynastyNerdsVariant, CalcPlayerValue[]>>;
  fantasyPros: Partial<Record<FantasyProsVariant, CalcPlayerValue[]>>;
  sleeperRank: CalcPlayerValue[];
}

function buildLeagueSourceDefs(
  sources: AllSources,
  isSuperflex: boolean,
  scoringFormat: ScoringFormat,
  tePremium: boolean
): { name: string; players: CalcPlayerValue[] }[] {
  const defs: { name: string; players: CalcPlayerValue[] }[] = [];

  // FantasyCalc: 1QB vs superflex
  const fc = isSuperflex ? sources.fcSF : sources.fc1QB;
  if (fc.length > 0) defs.push({ name: 'fantasyCalc', players: fc });

  // KTC: 1QB vs superflex
  const ktc = isSuperflex ? sources.ktcSF : sources.ktc1QB;
  if (ktc.length > 0) defs.push({ name: 'ktc', players: ktc });

  // Dynasty Nerds: pick best available variant
  let dnKey: DynastyNerdsVariant;
  if (isSuperflex && tePremium) dnKey = 'SFLEXTEP';
  else if (isSuperflex) dnKey = 'SFLEX';
  else if (scoringFormat === 'standard') dnKey = 'STD';
  else dnKey = 'PPR';
  const dn = sources.dynastyNerds[dnKey] ?? [];
  if (dn.length > 0) defs.push({ name: 'dynastyNerds', players: dn });

  // FantasyPros: pick best available variant
  let fpKey: FantasyProsVariant;
  if (isSuperflex) fpKey = 'sf';
  else if (tePremium) fpKey = 'tep';
  else fpKey = 'standard';
  const fp = sources.fantasyPros[fpKey] ?? [];
  if (fp.length > 0) defs.push({ name: 'fantasyPros', players: fp });

  // Sleeper rank: same for all leagues
  if (sources.sleeperRank.length > 0) defs.push({ name: 'sleeperRank', players: sources.sleeperRank });

  return defs;
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

  // Fetch all variants in parallel
  const [ktcVariants, dnVariants, fpVariants, dpValues] = await Promise.all([
    fetchAllKtcVariants(),
    fetchDynastyNerdsValues(),
    fetchAllFantasyProsVariants(),
    fetchDynastyProcessValues(false), // kept as fallback
  ]);

  // Fetch FantasyCalc variants (need separate calls)
  const [fc1QB, fcSF] = await Promise.all([
    fetchFantasyCalcValues(false),
    fetchFantasyCalcValues(true),
  ]);
  console.log(`FantasyCalc: 1QB=${fc1QB.length}, SF=${fcSF.length}`);

  const sleeperRank = extractSleeperRanks(allPlayers);
  console.log(`Sleeper search rank: ${sleeperRank.length} players`);

  const sources: AllSources = {
    fc1QB,
    fcSF,
    ktc1QB: ktcVariants.oneQB,
    ktcSF: ktcVariants.superflex,
    dynastyNerds: dnVariants,
    fantasyPros: fpVariants,
    sleeperRank,
  };

  // Determine which sources loaded
  const valueSources: string[] = [];
  if (fc1QB.length > 0 || fcSF.length > 0) valueSources.push('FantasyCalc');
  // Only count KTC if it loaded a meaningful number of players (>50)
  if (ktcVariants.oneQB.length > 50 || ktcVariants.superflex.length > 50) valueSources.push('KTC');
  else if (ktcVariants.oneQB.length > 0) console.warn(`KTC: only ${ktcVariants.oneQB.length} players loaded — site may have changed, skipping as value source`);
  if (Object.keys(dnVariants).length > 0) valueSources.push('DynastyNerds');
  if (Object.keys(fpVariants).length > 0) valueSources.push('FantasyPros');
  if (sleeperRank.length > 0) valueSources.push('SleeperRank');
  if (dpValues.length > 0) valueSources.push('DynastyProcess');

  console.log(`Value sources loaded: ${valueSources.join(', ') || 'none (all sources failed)'}`);

  if (valueSources.length === 0) {
    console.warn('Warning: all value sources failed. Output will have normalized:0 — not useful for trade analysis.');
  }

  console.log('Building league snapshots...');
  const leagueData = await Promise.all(
    dynastyLeagues.map((l) => buildLeagueData(l, user.user_id, allPlayers))
  );

  const picksOverride = loadPicksOverride();
  if (Object.keys(picksOverride).some(k => k !== '_comment')) {
    console.log('Applying picks overrides...');
    applyPicksOverrides(leagueData, picksOverride);
  }

  // Inject trade values per league using the correct scoring variant
  for (const league of leagueData) {
    const sourceDefs = buildLeagueSourceDefs(
      sources,
      league.isSuperflex,
      league.scoringFormat,
      league.tePremium
    );

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

  const leagueState = buildLeagueState(snapshot);
  fs.writeFileSync(path.join(DATA_DIR, 'league-state.md'), leagueState);
  console.log('Wrote data/league-state.md');

  console.log('\nDone. Load data/league-state.md into Claude Code context for trade analysis.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
