import { DIFFICULTIES, DIFFICULTY_ORDER, equalsInt, fromStrings } from '@numera/shared';
import { describe, expect, it } from 'vitest';
import { generateFallbackPuzzle, generatePuzzle } from './puzzle-generator';
import { applyMove, createInitialBoard } from './rule-engine';

describe('puzzle generator', () => {
  for (const difficulty of DIFFICULTY_ORDER) {
    const preset = DIFFICULTIES[difficulty];

    it(`generates 100 solvable ${difficulty} puzzles whose bot plan wins`, () => {
      for (let i = 0; i < 100; i += 1) {
        const puzzle = generatePuzzle(difficulty);

        expect(puzzle.difficulty).toBe(difficulty);
        expect(puzzle.cards).toHaveLength(preset.cardCount);
        expect(puzzle.botMovePlan).toHaveLength(preset.cardCount - 1);
        expect(puzzle.target).toBeGreaterThanOrEqual(preset.targetMin);
        expect(puzzle.target).toBeLessThanOrEqual(preset.targetMax);
        expect(puzzle.optimalSteps).toHaveLength(preset.cardCount - 1);
        expect(puzzle.optimalExpr.length).toBeGreaterThan(0);

        let board = createInitialBoard(puzzle.cards);
        let won = false;

        for (const move of puzzle.botMovePlan) {
          const result = applyMove(board, puzzle.target, move.cardAId, move.cardBId, move.operator);
          expect(result.mergedCardId).toBe(move.resultCardId);
          board = result.nextState;
          won = result.isWin;
        }

        expect(won).toBe(true);
        expect(board.cards).toHaveLength(1);
        const finalCard = board.cards[0];
        expect(finalCard).toBeDefined();
        if (!finalCard) continue;
        expect(equalsInt(fromStrings(finalCard.num, finalCard.den), puzzle.target)).toBe(true);
      }
    });

    it(`falls back to a verified ${difficulty} puzzle under a degenerate RNG`, () => {
      const puzzle = generatePuzzle(difficulty, () => 0.999_999);
      expect(puzzle.cards).toHaveLength(preset.cardCount);

      const fallback = generateFallbackPuzzle(difficulty);
      expect(fallback.target).toBeGreaterThanOrEqual(preset.targetMin);
      expect(fallback.target).toBeLessThanOrEqual(preset.targetMax);
    });
  }

  it('never repeats a card value more than twice in generated deals', () => {
    for (let i = 0; i < 60; i += 1) {
      const puzzle = generatePuzzle('scott_wu');
      const counts = new Map<string, number>();
      for (const card of puzzle.cards) {
        counts.set(card.display, (counts.get(card.display) ?? 0) + 1);
      }
      for (const count of counts.values()) {
        expect(count).toBeLessThanOrEqual(2);
      }
    }
  });
});
