import { describe, expect, it } from 'vitest';
import { botMatchElo, clamp, eloDelta, expectedScore, pvpElo } from './elo';

describe('Elo', () => {
  it('gives symmetric deltas between equally rated PvP players', () => {
    const { a, b } = pvpElo(1200, 1200, 'a');

    expect(a).toEqual({ eloBefore: 1200, eloAfter: 1216, delta: 16 });
    expect(b).toEqual({ eloBefore: 1200, eloAfter: 1184, delta: -16 });
    expect(a.delta).toBe(-b.delta);
  });

  it('keeps PvP deltas symmetric across rating pairs and outcomes', () => {
    const pairs: Array<[number, number]> = [
      [1200, 1200],
      [1500, 1100],
      [900, 1750],
      [2000, 1990],
    ];

    for (const [ratingA, ratingB] of pairs) {
      for (const outcome of ['a', 'b', 'draw'] as const) {
        const { a, b } = pvpElo(ratingA, ratingB, outcome);
        expect(a.delta + b.delta).toBe(0);
        expect(a.eloAfter + b.eloAfter).toBe(ratingA + ratingB);
      }
    }
  });

  it('clamps bot-match deltas to [-16, +16] and leaves bot ratings fixed', () => {
    const upsetWin = botMatchElo(1000, 1650, 'a');
    expect(upsetWin.human.delta).toBe(16);
    expect(upsetWin.human.eloAfter).toBe(1016);
    expect(upsetWin.bot).toEqual({ eloBefore: 1650, eloAfter: 1650, delta: 0 });

    const heavyLoss = botMatchElo(2200, 1000, 'b');
    expect(heavyLoss.human.delta).toBe(-16);
    expect(heavyLoss.bot.delta).toBe(0);

    const draw = botMatchElo(1200, 1200, 'draw');
    expect(draw.human.delta).toBe(0);
  });

  it('exposes the standard expected score curve', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 10);
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.5);
    expect(expectedScore(800, 1200)).toBeLessThan(0.5);
  });

  it('rounds raw deltas and clamps aggressively', () => {
    expect(eloDelta(0.5, 1)).toBe(16);
    expect(eloDelta(0.5, 1, 5)).toBe(5);
    expect(clamp(99, -5, 5)).toBe(5);
  });
});
