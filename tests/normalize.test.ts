import { describe, it, expect } from 'vitest';
import { buildValueIndex, resolvePlayerValues } from '../src/normalize.js';
import type { CalcPlayerValue } from '../src/types.js';

describe('buildValueIndex', () => {
  it('indexes by sleeper ID when present', () => {
    const source: CalcPlayerValue[] = [{ name: 'Justin Jefferson', sleeperId: '6794', value: 9500 }];
    const index = buildValueIndex(source);
    expect(index.byId.get('6794')?.value).toBe(9500);
    expect(index.max).toBe(9500);
  });

  it('indexes by normalized name as fallback', () => {
    const source: CalcPlayerValue[] = [{ name: "Ja'Marr Chase Jr.", value: 9000 }];
    const index = buildValueIndex(source);
    expect(index.byName.get('jamarr chase')).toBeDefined();
  });

  it('tracks max value', () => {
    const source: CalcPlayerValue[] = [{ name: 'A', value: 5000 }, { name: 'B', value: 9000 }];
    expect(buildValueIndex(source).max).toBe(9000);
  });
});

describe('resolvePlayerValues', () => {
  const fc: CalcPlayerValue[] = [
    { name: 'Justin Jefferson', sleeperId: '6794', value: 9500 },
    { name: 'Patrick Mahomes', sleeperId: '4046', value: 7125 },
  ];
  const ktc: CalcPlayerValue[] = [
    { name: 'Justin Jefferson', sleeperId: '6794', value: 9000 },
    { name: 'Patrick Mahomes', sleeperId: '4046', value: 6750 },
  ];

  it('averages normalized values across sources', () => {
    const result = resolvePlayerValues('6794', 'Justin Jefferson', [
      { name: 'fantasyCalc', players: fc },
      { name: 'ktc', players: ktc },
    ]);
    // FC: 9500/9500=100, KTC: 9000/9000=100 → avg=100
    expect(result.normalized).toBe(100);
    expect(result.fantasyCalc).toBe(9500);
    expect(result.ktc).toBe(9000);
  });

  it('uses only available sources when one is missing the player', () => {
    const result = resolvePlayerValues('4046', 'Patrick Mahomes', [
      { name: 'fantasyCalc', players: fc },
      { name: 'ktc', players: [] },
    ]);
    expect(result.fantasyCalc).toBe(7125);
    expect(result.ktc).toBeUndefined();
    // 7125/9500 * 100 ≈ 75
    expect(result.normalized).toBeCloseTo(75, 0);
  });

  it('returns normalized 0 when player not found in any source', () => {
    const result = resolvePlayerValues('999', 'Unknown Player', [
      { name: 'fantasyCalc', players: fc },
    ]);
    expect(result.normalized).toBe(0);
  });

  it('matches by name when sleeper ID not in source', () => {
    const noId: CalcPlayerValue[] = [{ name: 'Justin Jefferson', value: 8000 }];
    const result = resolvePlayerValues('6794', 'Justin Jefferson', [
      { name: 'fantasyCalc', players: noId },
    ]);
    expect(result.normalized).toBe(100); // 8000/8000=100
  });
});
