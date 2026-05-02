import type { Snapshot, League, Team, DraftPick } from './types.js';

const PLAYER_TABLE_LIMIT = 15;

function pickLabel(round: number): string {
  if (round === 1) return '1st';
  if (round === 2) return '2nd';
  if (round === 3) return '3rd';
  return `${round}th`;
}

function scoringFormatLabel(format: League['scoringFormat']): string {
  if (format === 'ppr') return 'PPR';
  if (format === 'half_ppr') return 'Half-PPR';
  return 'Standard';
}

function formatPick(pick: DraftPick, team: Team): string {
  const isOwn =
    pick.originalOwnerName === team.ownerName ||
    pick.originalOwnerName === team.teamName;
  const label = pickLabel(pick.round);
  return isOwn
    ? `${pick.season} ${label} (own)`
    : `${pick.season} ${label} (via ${pick.originalOwnerName})`;
}

function formatTeam(team: Team, isMyTeam: boolean): string {
  const lines: string[] = [];

  const myLabel = isMyTeam ? ' **(MY TEAM)**' : '';
  const ownerDisplay = team.ownerName || team.teamName;
  lines.push(`### ${team.teamName} — ${ownerDisplay}${myLabel}`);
  lines.push('');
  lines.push(`**Win Window:** ${team.winWindow.toUpperCase()}`);
  lines.push(`**Total Roster Value:** ${team.totalRosterValue}`);
  lines.push('');

  // Player table — top 15 by normalized value
  const sorted = [...team.roster].sort(
    (a, b) => b.values.normalized - a.values.normalized
  );
  const displayed = sorted.slice(0, PLAYER_TABLE_LIMIT);
  const remaining = sorted.length - displayed.length;

  lines.push('| Player | Pos | Age | Value |');
  lines.push('|--------|-----|-----|-------|');
  for (const rp of displayed) {
    const { name, position, age } = rp.player;
    lines.push(`| ${name} | ${position} | ${age} | ${rp.values.normalized} |`);
  }
  if (remaining > 0) {
    lines.push(`| +${remaining} more | | | |`);
  }
  lines.push('');

  // Picks grouped and sorted by season then round
  if (team.picks.length > 0) {
    const sortedPicks = [...team.picks].sort((a, b) => {
      const seasonDiff = parseInt(a.season) - parseInt(b.season);
      return seasonDiff !== 0 ? seasonDiff : a.round - b.round;
    });
    const pickStrings = sortedPicks.map((p) => formatPick(p, team));
    lines.push(`**Picks:** ${pickStrings.join(', ')}`);
  } else {
    lines.push('**Picks:** None');
  }

  return lines.join('\n');
}

function formatLeague(league: League): string {
  const lines: string[] = [];

  const formatLabel = scoringFormatLabel(league.scoringFormat);
  const sfLabel = league.isSuperflex ? ', Superflex' : '';
  lines.push(`## League: ${league.name} (${formatLabel}${sfLabel})`);
  lines.push('');

  // Sort: my team first, then descending by totalRosterValue
  const sorted = [...league.teams].sort((a, b) => {
    const aIsMine = a.rosterId === league.myRosterId;
    const bIsMine = b.rosterId === league.myRosterId;
    if (aIsMine && !bIsMine) return -1;
    if (bIsMine && !aIsMine) return 1;
    return b.totalRosterValue - a.totalRosterValue;
  });

  const teamSections = sorted.map((team) =>
    formatTeam(team, team.rosterId === league.myRosterId)
  );
  lines.push(teamSections.join('\n\n---\n\n'));

  return lines.join('\n');
}

export function formatSnapshot(snapshot: Snapshot): string {
  const lines: string[] = [];

  lines.push('# Dynasty Trade Snapshot');
  lines.push('');
  lines.push(`**Generated:** ${new Date(snapshot.createdAt).toLocaleString()}`);
  lines.push(`**Value Sources:** ${snapshot.valueSources.join(', ')}`);
  lines.push('');
  lines.push(
    '> Load this file into Claude Code to analyze trade offers. Ask: "Evaluate this trade for my team" or "Which teams are most likely to trade away X?"'
  );
  lines.push('');

  const leagueSections = snapshot.leagues.map(formatLeague);
  lines.push(leagueSections.join('\n\n'));

  return lines.join('\n');
}
