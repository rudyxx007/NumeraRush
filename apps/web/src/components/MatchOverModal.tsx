import { ArrowLeft, RotateCcw, X } from 'lucide-react';
import { useRef } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import { exitRoom } from '../lib/route';
import { useGameStore } from '../store/game-store';

function formatSolve(ms: number): string {
  return ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—';
}

export function MatchOverModal() {
  const matchOver = useGameStore((state) => state.matchOver);
  const userId = useGameStore((state) => state.userId);
  const rematch = useGameStore((state) => state.rematch);
  const dismiss = useGameStore((state) => state.dismissMatchOver);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useModalDialog(dialogRef, matchOver !== null, dismiss);

  if (!matchOver) return null;

  const winner = matchOver.standings.find((standing) => standing.userId === matchOver.winnerUserId);
  const isDraw = matchOver.winnerUserId === null;
  const iWon = matchOver.winnerUserId === userId;

  return (
    <div className="veil">
      <dialog
        ref={dialogRef}
        aria-modal="true"
        aria-label="Match results"
        className="static m-auto w-full max-w-2xl border-0 bg-transparent p-0 text-ink"
      >
        <div className="modal-sheet sheet-in overflow-hidden">
          <div className="flex items-start gap-3 border-b border-ink p-5 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="mono text-[10px] tracking-[0.12em] text-ink-soft">match complete</p>
              <h2 className="display mt-2 text-[1.6rem] sm:text-[1.8rem]">
                {isDraw
                  ? 'Dead heat.'
                  : iWon
                    ? 'You own the table.'
                    : `${winner?.playerName ?? 'Your rival'} takes it.`}
              </h2>
              <p className="mt-2 text-[12px] text-ink-soft">
                Elo is calculated server-side and capped at ±16 against bots.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close match results"
              className="text-ink-soft transition hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 sm:p-6">
            <ul className="sm:hidden">
              {matchOver.standings.map((standing, index) => {
                const delta = standing.eloAfter - standing.eloBefore;
                const isMe = standing.userId === userId;
                return (
                  <li key={standing.userId} className="border-b border-rule py-3 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="mono text-[10px] text-ink-faint">{index + 1}</span>
                        <span className="truncate text-[13px] font-medium">
                          {standing.playerName}
                        </span>
                        {isMe && (
                          <span className="mono text-[9px] tracking-[0.08em] text-ultra uppercase">
                            you
                          </span>
                        )}
                        {standing.isBot && (
                          <span className="mono text-[9px] text-ink-faint">bot</span>
                        )}
                      </span>
                      <span className="mono shrink-0 text-[15px] font-medium">
                        {standing.score}
                      </span>
                    </div>
                    <dl className="mono mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-ink-soft">
                      <div>
                        <dt className="inline">rounds </dt>
                        <dd className="inline text-ink">{standing.roundsWon}</dd>
                      </div>
                      <div>
                        <dt className="inline">avg solve </dt>
                        <dd className="inline text-ink">{formatSolve(standing.avgSolveMs)}</dd>
                      </div>
                      <div>
                        <dt className="inline">elo </dt>
                        <dd className="inline text-ink">
                          {standing.eloBefore}→{standing.eloAfter}{' '}
                          <span
                            className={
                              delta > 0 ? 'text-forest' : delta < 0 ? 'text-rust' : 'text-ink-faint'
                            }
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="mono text-[9px] tracking-[0.1em] text-ink-soft">
                    <th className="w-8 border-b border-ink pb-2 font-normal">#</th>
                    <th className="border-b border-ink pb-2 font-normal">player</th>
                    <th className="w-16 border-b border-ink pb-2 text-right font-normal">score</th>
                    <th className="w-16 border-b border-ink pb-2 text-right font-normal">rounds</th>
                    <th className="w-20 border-b border-ink pb-2 text-right font-normal">
                      avg solve
                    </th>
                    <th className="w-32 border-b border-ink pb-2 text-right font-normal">elo</th>
                  </tr>
                </thead>
                <tbody>
                  {matchOver.standings.map((standing, index) => {
                    const delta = standing.eloAfter - standing.eloBefore;
                    const isMe = standing.userId === userId;
                    return (
                      <tr
                        key={standing.userId}
                        className={`border-b border-rule ${isMe ? 'bg-paper' : ''}`}
                      >
                        <td className="mono py-2.5 text-[11px] text-ink-faint">{index + 1}</td>
                        <td className="py-2.5">
                          <span className="flex items-baseline gap-1.5">
                            <span className="max-w-[9rem] truncate text-[12px] font-medium">
                              {standing.playerName}
                            </span>
                            {isMe && (
                              <span className="mono text-[9px] text-ultra uppercase">you</span>
                            )}
                            {standing.isBot && (
                              <span className="mono text-[9px] text-ink-faint">bot</span>
                            )}
                          </span>
                        </td>
                        <td className="mono py-2.5 text-right text-[12px] font-medium">
                          {standing.score}
                        </td>
                        <td className="mono py-2.5 text-right text-[12px]">{standing.roundsWon}</td>
                        <td className="mono py-2.5 text-right text-[12px]">
                          {formatSolve(standing.avgSolveMs)}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <span className="mono text-[12px]">
                            {standing.eloBefore}→{standing.eloAfter}
                          </span>
                          <span
                            className={`mono ml-1.5 inline-block text-[10px] font-medium ${
                              delta > 0 ? 'text-forest' : delta < 0 ? 'text-rust' : 'text-ink-faint'
                            }`}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={rematch} className="btn btn-solid btn-lg flex-1">
                <RotateCcw size={15} /> Rematch
              </button>
              <button type="button" onClick={exitRoom} className="btn btn-quiet btn-lg flex-1">
                <ArrowLeft size={15} /> Back to lobby
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
