import type { Operator } from '@numera/shared';
import { RotateCcw, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { useGameStore } from '../store/game-store';

const OPERATORS: Array<{ value: Operator; symbol: string }> = [
  { value: '+', symbol: '+' },
  { value: '-', symbol: '−' },
  { value: '*', symbol: '×' },
  { value: '/', symbol: '÷' },
];

const OPERATOR_KEYS: Record<string, Operator> = {
  '+': '+',
  '-': '-',
  '*': '*',
  x: '*',
  X: '*',
  '/': '/',
};

export function CardBoard() {
  const room = useGameStore((state) => state.room);
  const selectedCardId = useGameStore((state) => state.selectedCardId);
  const selectedOperator = useGameStore((state) => state.selectedOperator);
  const selectCard = useGameStore((state) => state.selectCard);
  const selectOperator = useGameStore((state) => state.selectOperator);
  const undo = useGameStore((state) => state.undo);
  const reset = useGameStore((state) => state.reset);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const state = useGameStore.getState();
      const currentRoom = state.room;
      if (!currentRoom || currentRoom.phase !== 'playing') return;

      if (event.key === 'Escape') {
        state.clearSelection();
        return;
      }
      if (event.key === 'z' || event.key === 'Z') {
        state.undo();
        return;
      }
      if (event.key === 'r' || event.key === 'R') {
        state.reset();
        return;
      }

      const operator = OPERATOR_KEYS[event.key];
      if (operator) {
        event.preventDefault();
        state.selectOperator(operator);
        return;
      }

      const index = Number.parseInt(event.key, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < currentRoom.cards.length) {
        const card = currentRoom.cards[index];
        if (card) state.selectCard(card.id);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!room) return null;

  const disabled = room.phase !== 'playing';
  const cardCount = room.cards.length;
  const columnClass =
    cardCount === 4 || cardCount > 6
      ? 'sm:grid-cols-4'
      : cardCount === 5
        ? 'sm:grid-cols-5'
        : 'sm:grid-cols-3';

  return (
    <section className="sheet">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink px-5 py-4">
        <h2 className="display text-[1.25rem]">Your board</h2>
        <span className="mono text-[11px] text-ink-soft">
          <span className="font-medium text-ink">{room.movesCompleted}</span> / {room.movesRequired}{' '}
          merges
        </span>
      </div>

      <div className="px-5 py-5">
        <div className={`grid grid-cols-2 gap-2 ${columnClass}`}>
          {room.cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              aria-pressed={selectedCardId === card.id}
              aria-label={`Card ${index + 1}: ${card.display}`}
              onClick={() => selectCard(card.id)}
              disabled={disabled}
              className="tile min-h-[6.5rem]"
            >
              <span className="tile-index absolute top-2 right-2.5">{index + 1}</span>
              <div className="tile-num">{card.display}</div>
              {card.expr !== card.display && <div className="tile-expr mt-2.5">{card.expr}</div>}
            </button>
          ))}

          {room.cards.length === 0 && (
            <div className="col-span-full border border-dashed border-rule px-4 py-10 text-center">
              <p className="mono text-[11px] text-ink-soft">
                waiting for the next round to be dealt
              </p>
            </div>
          )}
        </div>

        <p className="label mt-6">operator</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {OPERATORS.map((operator) => (
            <button
              key={operator.value}
              type="button"
              aria-pressed={selectedOperator === operator.value}
              aria-label={`Operator ${operator.symbol}`}
              onClick={() => selectOperator(operator.value)}
              disabled={disabled || !selectedCardId}
              className="op-tile"
            >
              {operator.symbol}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-ink-soft">
            Pick a card, an operator, then the second card.
          </span>
          <span className="mono hidden items-center gap-1 text-[10px] text-ink-soft sm:flex">
            keys <span className="kbd">1</span>–<span className="kbd">7</span>
            <span className="kbd">+</span>
            <span className="kbd">−</span>
            <span className="kbd">×</span>
            <span className="kbd">÷</span>
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={disabled || !room.canUndo}
              className="btn btn-quiet px-3 py-1.5"
            >
              <Undo2 size={13} /> Undo <span className="kbd">Z</span>
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={disabled || room.movesCompleted === 0}
              className="btn btn-quiet px-3 py-1.5"
            >
              <RotateCcw size={13} /> Reset <span className="kbd">R</span>
            </button>
          </div>
          <span className="mono text-[10px] text-ink-soft">every card exactly once</span>
        </div>
      </div>
    </section>
  );
}
