/**
 * Generates data/league-state.md — a single file combining snapshot, devy rosters,
 * and scoring context so Claude can load everything in one read.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSnapshot } from './format-summary.js';
import type { Snapshot } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

interface DevyPlayer {
  owner: string;
  name: string;
  position: string;
  draftYear: number;
  college?: string;
}

interface DevyFile {
  league: string;
  players: DevyPlayer[];
}

function loadDevy(): DevyFile[] {
  const devyPath = path.join(ROOT, 'devy-players.json');
  if (!fs.existsSync(devyPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(devyPath, 'utf8'));
    // Support single object or array
    return Array.isArray(raw) ? raw : [raw];
  } catch {
    return [];
  }
}

function formatDevySection(devyFiles: DevyFile[]): string {
  if (devyFiles.length === 0) return '';

  const lines: string[] = [];
  lines.push('## Devy Rosters');
  lines.push('');
  lines.push('> Manually maintained. Values not in trade calculators — assess based on college profile and draft year.');
  lines.push('');

  for (const file of devyFiles) {
    lines.push(`### ${file.league}`);
    lines.push('');

    // Group by owner
    const byOwner = new Map<string, DevyPlayer[]>();
    for (const p of file.players) {
      const arr = byOwner.get(p.owner) ?? [];
      arr.push(p);
      byOwner.set(p.owner, arr);
    }

    lines.push('| Owner | Player | Pos | Draft Year | College |');
    lines.push('|-------|--------|-----|------------|---------|');
    for (const [owner, players] of [...byOwner.entries()].sort()) {
      for (const p of players) {
        lines.push(`| ${owner} | ${p.name} | ${p.position} | ${p.draftYear} | ${p.college ?? '—'} |`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatScoringContext(snapshot: Snapshot): string {
  const lines: string[] = [];
  lines.push('## League Scoring Reference');
  lines.push('');

  for (const league of snapshot.leagues) {
    const format = league.scoringFormat === 'ppr' ? 'PPR'
      : league.scoringFormat === 'half_ppr' ? 'Half-PPR'
      : 'Standard';
    const tep = league.tePremium ? ` +${league.tePremiumAmount}TE premium` : '';
    const sf = league.isSuperflex ? ', Superflex' : ', 1QB';
    lines.push(`- **${league.name}:** ${format}${tep}${sf}`);
  }

  lines.push('');
  lines.push('> TE Premium means every TE reception scores bonus points — TEs in FLEX spots are more valuable than equivalent WRs.');
  lines.push('');

  return lines.join('\n');
}

export function buildLeagueState(snapshot: Snapshot): string {
  const devyFiles = loadDevy();
  const parts: string[] = [];

  // Header
  parts.push('# Dynasty League State');
  parts.push('');
  parts.push(`**Generated:** ${new Date(snapshot.createdAt).toLocaleString()}`);
  parts.push(`**Value Sources:** ${snapshot.valueSources.join(', ')}`);
  parts.push('');
  parts.push('> Full league context for trade analysis. Includes rosters, picks, devy, and scoring rules.');
  parts.push('');
  parts.push('---');
  parts.push('');

  // Scoring context up front so it frames the rest of the analysis
  parts.push(formatScoringContext(snapshot));

  // Main snapshot (all leagues, teams, rosters, picks)
  parts.push('---');
  parts.push('');
  // Re-use formatSnapshot but strip its header (we already have one)
  const snapshotBody = formatSnapshot(snapshot)
    .split('\n')
    .slice(7) // skip "# Dynasty Trade Snapshot", generated line, value sources, usage tip
    .join('\n');
  parts.push(snapshotBody);

  // Devy section appended at the end
  const devySection = formatDevySection(devyFiles);
  if (devySection) {
    parts.push('');
    parts.push('---');
    parts.push('');
    parts.push(devySection);
  }

  return parts.join('\n');
}
