import { fromInt, toCardDTO } from '@numera/shared';
import { describe, expect, it } from 'vitest';
import { EngineError, applyMove, createInitialBoard, resetBoard, undoMove } from './rule-engine';

function cardsFromValues(values: number[]) {
  return values.map((value, index) => toCardDTO(`c_${index}`, fromInt(value), String(value)));
}

describe('rule engine', () => {
  it('removes only the two selected cards when duplicate values exist', () => {
    const state = createInitialBoard(cardsFromValues([10, 10, 10]));
    const result = applyMove(state, 30, 'c_0', 'c_1', '+');

    expect(result.nextState.cards.map((card) => card.id)).toEqual(['c_2', 'm_1']);
    expect(result.nextState.cards.find((card) => card.id === 'c_2')?.display).toBe('10');
    expect(result.mergedCard.display).toBe('20');
    expect(result.movesCompleted).toBe(1);
  });

  it('is non-commutative for subtraction and division', () => {
    const state = createInitialBoard(cardsFromValues([10, 3]));
    const subtraction = applyMove(state, 7, 'c_0', 'c_1', '-');
    const reversedSubtraction = applyMove(state, 7, 'c_1', 'c_0', '-');
    expect(subtraction.mergedCard.display).toBe('7');
    expect(reversedSubtraction.mergedCard.display).toBe('-7');

    const eightTwo = createInitialBoard(cardsFromValues([8, 2]));
    expect(applyMove(eightTwo, 4, 'c_0', 'c_1', '/').mergedCard.display).toBe('4');
    expect(applyMove(eightTwo, 4, 'c_1', 'c_0', '/').mergedCard.display).toBe('1/4');
  });

  it('does not win early when unused cards remain', () => {
    const state = createInitialBoard(cardsFromValues([6, 6, 4]));
    const result = applyMove(state, 12, 'c_0', 'c_1', '+');

    expect(result.mergedCard.display).toBe('12');
    expect(result.nextState.cards).toHaveLength(2);
    expect(result.isWin).toBe(false);
    expect(result.winningExpr).toBeNull();
  });

  it('wins exactly when one card remains and it equals the target', () => {
    let state = createInitialBoard(cardsFromValues([6, 4, 3, 2]));
    let result = applyMove(state, 36, 'c_0', 'c_1', '*');
    state = result.nextState;
    result = applyMove(state, 36, 'm_1', 'c_2', '*');
    state = result.nextState;
    result = applyMove(state, 36, 'm_2', 'c_3', '/');

    expect(result.isWin).toBe(true);
    expect(result.winningExpr).toBe('(((6 * 4) * 3) / 2)');
    expect(result.nextState.cards).toHaveLength(1);
    expect(result.nextState.cards[0]?.display).toBe('36');
  });

  it('undoes to the exact previous board and resets to the initial board', () => {
    const initial = cardsFromValues([6, 4, 3, 2]);
    const first = applyMove(createInitialBoard(initial), 36, 'c_0', 'c_1', '*');
    const second = applyMove(first.nextState, 36, 'm_1', 'c_2', '*');

    const undone = undoMove(second.nextState);
    expect(undone.cards.map((card) => card.id)).toEqual(['c_2', 'c_3', 'm_1']);
    expect(undone.cards.find((card) => card.id === 'm_1')?.display).toBe('24');
    expect(undone.history).toHaveLength(1);

    const reset = resetBoard(second.nextState);
    expect(reset.cards.map((card) => card.id)).toEqual(['c_0', 'c_1', 'c_2', 'c_3']);
    expect(reset.history).toEqual([]);
    expect(reset.nextMergeSeq).toBe(1);
  });

  it('returns the same state when there is nothing to undo', () => {
    const state = createInitialBoard(cardsFromValues([1, 2]));
    expect(undoMove(state)).toBe(state);
  });

  it('reuses safe merge ids after undo so plans never collide', () => {
    const first = applyMove(createInitialBoard(cardsFromValues([6, 4, 3])), 36, 'c_0', 'c_1', '*');
    const undone = undoMove(first.nextState);
    expect(undone.nextMergeSeq).toBe(1);

    const next = applyMove(undone, 36, 'c_0', 'c_1', '*');
    expect(next.mergedCardId).toBe('m_1');
  });

  it('rejects identical or missing cards and division by zero', () => {
    const state = createInitialBoard(cardsFromValues([8, 4]));

    expect(() => applyMove(state, 12, 'c_0', 'c_0', '+')).toThrow(EngineError);
    expect(() => applyMove(state, 12, 'c_0', 'c_9', '+')).toThrow(EngineError);

    try {
      applyMove(state, 12, 'c_0', 'c_9', '+');
    } catch (error) {
      expect((error as EngineError).code).toBe('INVALID_MOVE');
    }

    const zeroed = createInitialBoard(cardsFromValues([8, 0]));
    try {
      applyMove(zeroed, 8, 'c_0', 'c_1', '/');
      throw new Error('expected DIV_BY_ZERO');
    } catch (error) {
      expect((error as EngineError).code).toBe('DIV_BY_ZERO');
    }
  });
});
