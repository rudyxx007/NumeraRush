import { X } from 'lucide-react';
import { useGameStore } from '../store/game-store';

export function RoundSummaryModal() {
  const summary = useGameStore((state) => state.roundSummary);
  const userId = useGameStore((state) => state.userId);
  const dismiss = useGameStore((state) => state.dismissRoundSummary);

  if (!summary) return null;

  const isDraw = summary.winnerUserId === null;
  const isWinner = summary.winnerUserId !== null && summary.winnerUserId === userId;
  const scoreRows = Object.entries(summary.scores);

  return (
    <div className="veil">
      <dialog
        open
        aria-modal="true"
        aria-label={`Round ${summary.roundNumber} summary`}
        className="static m-auto w-full max-w-lg border-0 bg-transparent p-0 text-ink"
      >
        <div className="modal-sheet sheet-in overflow-hidden">
          <div className="track rounded-t-[1px]">
            <div
              key={`${summary.roundNumber}-${summary.nextRoundAtMs ?? 0}`}
              className="countdown-bar track-fill track-fill-ultra"
            />
          </div>

          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="mono text-[10px] tracking-[0.12em] text-ink-soft">
                  round {String(summary.roundNumber).padStart(2, '0')} result
                </p>
                <h2 className="display mt-2 text-[1.7rem]">
                  {isDraw
                    ? 'Nobody reached the target.'
                    : isWinner
                      ? 'You took the round.'
                      : `${summary.winnerName ?? 'Your rival'} got there first.`}
                </h2>
                {!isDraw && (
                  <p className="mono mt-2 text-[11px] text-ink-soft">
                    +{summary.pointsAwarded} points, base plus speed bonus
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close round summary"
                className="text-ink-soft transition hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 border border-ink bg-paper px-4 py-3">
              <p className="label">winning expression</p>
              <p className="mono mt-1.5 text-[13px] break-words text-forest">
                {summary.winningExpr ?? 'no winning expression this round'}
              </p>
            </div>

            <div className="mt-4">
              <p className="label">verified optimal trace</p>
              <ol className="mt-2">
                {summary.optimalSteps.map((step, index) => (
                  <li
                    key={`${summary.roundNumber}-step-${index}`}
                    className="flex items-baseline gap-3 border-b border-rule py-1.5"
                  >
                    <span className="mono w-4 shrink-0 text-[10px] text-ink-faint">
                      {index + 1}
                    </span>
                    <span className="mono text-[12px]">{step}</span>
                  </li>
                ))}
              </ol>
              {summary.optimalExpr !== summary.winningExpr && (
                <p className="mono mt-2 truncate text-[10px] text-ink-soft">
                  <span className="text-ink-faint">optimal form </span>
                  {summary.optimalExpr}
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 divide-x divide-rule border border-ink">
              {scoreRows.map(([playerId, score]) => (
                <div key={playerId} className="px-4 py-2.5">
                  <p className="label">{playerId === userId ? 'you' : 'rival'}</p>
                  <p className="mono mt-0.5 text-[1.05rem] font-medium">{score}</p>
                </div>
              ))}
            </div>

            <p className="mono mt-4 text-center text-[10px] text-ink-soft">
              next round starts automatically in five seconds
            </p>
          </div>
        </div>
      </dialog>
    </div>
  );
}
