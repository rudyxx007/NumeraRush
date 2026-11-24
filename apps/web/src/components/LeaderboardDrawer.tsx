import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useGameStore } from '../store/game-store';

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  scott_wu: 'Scott Wu',
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LeaderboardDrawer() {
  const open = useGameStore((state) => state.leaderboardOpen);
  const toggle = useGameStore((state) => state.toggleLeaderboard);
  const playerName = useGameStore((state) => state.playerName);
  const { rankings, recentMatches, isLoading } = useLeaderboard();

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') toggle(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, toggle]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close standings"
        onClick={() => toggle(false)}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
      />
      <aside className="drawer-in absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-ink bg-card">
        <div className="flex items-center justify-between border-b border-ink px-5 py-4">
          <div>
            <h2 className="display text-[1.4rem]">Standings</h2>
            <p className="mono mt-0.5 text-[10px] text-ink-soft">global elo, top 25</p>
          </div>
          <button
            type="button"
            onClick={() => toggle(false)}
            aria-label="Close standings"
            className="text-ink-soft transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="px-5 py-5">
            <div className="mono grid grid-cols-[2rem_1fr_3.5rem_3.5rem] gap-2 border-b border-ink pb-2 text-[9px] tracking-[0.12em] text-ink-soft">
              <span>#</span>
              <span>player</span>
              <span className="text-right">w / p</span>
              <span className="text-right">elo</span>
            </div>

            {rankings.map((row, index) => (
              <div
                key={row.id}
                className={`mono grid grid-cols-[2rem_1fr_3.5rem_3.5rem] items-baseline gap-2 border-b border-rule py-2 text-[11px] ${
                  row.player_name === playerName ? 'text-ultra' : 'text-ink'
                }`}
              >
                <span className="text-ink-faint">{index + 1}</span>
                <span className="truncate font-sans text-[12px] font-medium">
                  {row.player_name}
                  {row.is_bot ? (
                    <span className="mono ml-1 text-[9px] text-ink-faint">bot</span>
                  ) : null}
                </span>
                <span className="text-right text-ink-soft">
                  {row.matches_won}/{row.matches_played}
                </span>
                <span className="text-right font-medium">{row.elo_rating}</span>
              </div>
            ))}

            {rankings.length === 0 && (
              <p className="mono border-b border-rule py-8 text-center text-[10px] text-ink-soft">
                {isLoading ? 'reading the local replica' : 'no ranked players synced yet'}
              </p>
            )}
          </section>

          <section className="px-5 pb-8">
            <h3 className="mono text-[10px] tracking-[0.12em] text-ink-soft">recent matches</h3>

            <div className="mt-2">
              {recentMatches.map((row) => (
                <div key={row.id} className="border-b border-rule py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                      {row.player_name}
                    </span>
                    {row.match_winner ? (
                      <span className="mono text-[9px] tracking-[0.08em] text-forest uppercase">
                        win
                      </span>
                    ) : null}
                    <span className="mono text-[9px] text-ink-soft">
                      {DIFFICULTY_LABELS[row.difficulty] ?? row.difficulty}
                    </span>
                  </div>
                  <div className="mono mt-1 flex items-center gap-2 text-[10px] text-ink-soft">
                    <span>{row.score} pts</span>
                    <span>{row.rounds_won} rounds</span>
                    <span className="truncate">{formatWhen(row.played_at)}</span>
                  </div>
                </div>
              ))}

              {recentMatches.length === 0 && (
                <p className="mono border-b border-rule py-8 text-center text-[10px] text-ink-soft">
                  {isLoading ? 'reading the local replica' : 'no matches synced yet'}
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="mono border-t border-ink px-5 py-3 text-[10px] text-ink-soft">
          served from local PowerSync SQLite, zero REST polling
        </div>
      </aside>
    </div>
  );
}
