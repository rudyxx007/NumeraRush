import {
  type CardDTO,
  type Operator,
  type Rational,
  applyOp,
  equalsInt,
  formatRational,
  fromStrings,
  toCardDTO,
} from '@numera/shared';

export interface PlayerBoardState {
  cards: CardDTO[];
  history: CardDTO[][];
  initialCards: CardDTO[];
  nextMergeSeq: number;
}

export type EngineErrorCode = 'INVALID_MOVE' | 'DIV_BY_ZERO';

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export interface ApplyMoveResult {
  nextState: PlayerBoardState;
  isWin: boolean;
  winningExpr: string | null;
  mergedCardId: string;
  mergedCard: CardDTO;
  movesCompleted: number;
}

function cloneCards(cards: readonly CardDTO[]): CardDTO[] {
  return cards.map((card) => ({ ...card }));
}

/** Highest merge index currently on the board, so reused ids never collide. */
export function deriveNextMergeSeq(cards: readonly CardDTO[]): number {
  let maxSeq = 0;
  for (const card of cards) {
    const match = /^m_(\d+)$/.exec(card.id);
    if (match?.[1]) {
      maxSeq = Math.max(maxSeq, Number(match[1]));
    }
  }
  return maxSeq + 1;
}

export function createInitialBoard(cards: readonly CardDTO[]): PlayerBoardState {
  return {
    cards: cloneCards(cards),
    history: [],
    initialCards: cloneCards(cards),
    nextMergeSeq: 1,
  };
}

export function applyMove(
  state: PlayerBoardState,
  target: number,
  cardAId: string,
  cardBId: string,
  operator: Operator,
): ApplyMoveResult {
  if (cardAId === cardBId) {
    throw new EngineError('INVALID_MOVE', 'Pick two different cards');
  }

  const cardA = state.cards.find((card) => card.id === cardAId);
  const cardB = state.cards.find((card) => card.id === cardBId);

  if (!cardA || !cardB) {
    throw new EngineError('INVALID_MOVE', 'One of the selected cards is not on the board');
  }

  let result: Rational;
  try {
    result = applyOp(
      fromStrings(cardA.num, cardA.den),
      fromStrings(cardB.num, cardB.den),
      operator,
    );
  } catch {
    throw new EngineError('DIV_BY_ZERO', 'Division by zero is not allowed');
  }

  const mergedCard = toCardDTO(
    `m_${state.nextMergeSeq}`,
    result,
    `(${cardA.expr} ${operator} ${cardB.expr})`,
  );

  const history = [...state.history, cloneCards(state.cards)];
  const nextCards = state.cards
    .filter((card) => card.id !== cardAId && card.id !== cardBId)
    .concat(mergedCard);
  const isWin = nextCards.length === 1 && equalsInt(result, target);

  return {
    nextState: {
      cards: nextCards,
      history,
      initialCards: state.initialCards,
      nextMergeSeq: state.nextMergeSeq + 1,
    },
    isWin,
    winningExpr: isWin ? mergedCard.expr : null,
    mergedCardId: mergedCard.id,
    mergedCard,
    movesCompleted: history.length,
  };
}

export function undoMove(state: PlayerBoardState): PlayerBoardState {
  const lastSnapshot = state.history[state.history.length - 1];
  if (!lastSnapshot) {
    return state;
  }
  const cards = cloneCards(lastSnapshot);
  return {
    cards,
    history: state.history.slice(0, -1),
    initialCards: state.initialCards,
    nextMergeSeq: deriveNextMergeSeq(cards),
  };
}

export function resetBoard(state: PlayerBoardState): PlayerBoardState {
  return {
    cards: cloneCards(state.initialCards),
    history: [],
    initialCards: state.initialCards,
    nextMergeSeq: 1,
  };
}

/** Read-only helper used by UI-adjacent server code and tests. */
export function boardSummary(state: PlayerBoardState): string {
  return state.cards
    .map((card) => `${card.id}=${formatRational(fromStrings(card.num, card.den))}`)
    .join(' ');
}
