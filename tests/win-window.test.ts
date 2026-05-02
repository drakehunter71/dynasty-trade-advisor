import { describe, it, expect } from 'vitest';
import { inferWinWindow } from '../src/win-window.js';
import type { RosterPlayer, DraftPick } from '../src/types.js';

function makePlayer(id: string, age: number, normalized: number): RosterPlayer {
  return {
    player: { sleeperId: id, name: id, position: 'WR', nflTeam: 'XX', age, yearsExp: 1 },
    values: { normalized },
  };
}

function makePick(season: string, round: number): DraftPick {
  return { season, round, originalOwnerName: 'Other', currentOwnerName: 'Current', currentOwnerRosterId: 1 };
}

describe('inferWinWindow', () => {
  it('returns rebuilding for empty roster', () => {
    expect(inferWinWindow([], [])).toBe('rebuilding');
  });

  it('returns rebuilding for very young roster', () => {
    const roster = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i}`, 21, 50 + i));
    expect(inferWinWindow(roster, [])).toBe('rebuilding');
  });

  it('returns rebuilding for 3+ future first-round picks', () => {
    const roster = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i}`, 27, 70 + i));
    const picks = [makePick('2027', 1), makePick('2027', 1), makePick('2028', 1)];
    expect(inferWinWindow(roster, picks)).toBe('rebuilding');
  });

  it('returns win-now for older roster with 3+ elite players', () => {
    const roster = [
      makePlayer('a', 29, 95), makePlayer('b', 30, 90), makePlayer('c', 28, 88),
      makePlayer('d', 31, 85), makePlayer('e', 29, 80), makePlayer('f', 28, 75),
      makePlayer('g', 30, 70), makePlayer('h', 29, 65),
    ];
    expect(inferWinWindow(roster, [])).toBe('win-now');
  });

  it('returns contending for prime-age with 2 elite players', () => {
    const roster = [
      makePlayer('a', 26, 90), makePlayer('b', 25, 85), makePlayer('c', 26, 65),
      makePlayer('d', 27, 60), makePlayer('e', 25, 55), makePlayer('f', 26, 50),
      makePlayer('g', 27, 45), makePlayer('h', 25, 40),
    ];
    expect(inferWinWindow(roster, [])).toBe('contending');
  });

  it('returns developing for young roster with few elite players', () => {
    const roster = [
      makePlayer('a', 23, 70), makePlayer('b', 22, 60), makePlayer('c', 24, 50),
      makePlayer('d', 23, 45), makePlayer('e', 22, 40), makePlayer('f', 24, 35),
      makePlayer('g', 23, 30), makePlayer('h', 22, 25),
    ];
    expect(inferWinWindow(roster, [])).toBe('developing');
  });

  it('returns developing for roster with avgAge of 22', () => {
    const roster = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i}`, 22, 50 + i));
    expect(inferWinWindow(roster, [])).toBe('developing');
  });
});
