import { useStatus } from '@powersync/react';
import { Database } from 'lucide-react';
import { useLiveRace } from '../hooks/useLiveRace';
import { useGameStore } from '../store/game-store';

export function LiveRacePanel() {
  const room = useGameStore((state) => state.room);
  const userId = useGameStore((state) => state.userId);
  const { rows, isLoading } = useLiveRace(room?.roomCode ?? null);
  const syncStatus = useStatus();

  const syncLabel = syncStatus.connected ? (syncStatus.downloading ? 'syncing' : 'live') : 'local';

  return (
    <aside className="sheet flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2 border-b border-ink px-5 py-4">
        <h2 className="display text-[1.25rem]">Live race</h2>
        <span className="mono flex items-center gap-1.5 text-[10px] text-ink-soft">
          <span
            className={`dot ${syncStatus.connected ? 'text-forest' : 'text-ink-faint'}`}
            aria-hidden="true"
          />
          {syncLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8 px-5 py-8">
        {rows.map((row) => {
          const isMe = row.user_id === userId;
          const required = row.moves_required > 0 ? row.moves_required : room?.movesRequired || 1;
          const percent = Math.min(100, Math.round((row.moves_completed / required) * 100));

          return (
            <div key={row.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[13px] font-medium">
                    {row.player_name}
                    {row.is_bot ? (
                      <span className="mono ml-1 text-[10px] text-ink-faint">bot</span>
                    ) : null}
                  </span>
                  {isMe && (
                    <span className="mono text-[9px] tracking-[0.1em] text-ultra uppercase">
                      you
                    </span>
                  )}
                </span>
                <span className="mono text-[13px] font-medium">{row.score}</span>
              </div>

              <div className="track mt-1.5">
                <div
                  className={`track-fill ${isMe ? 'track-fill-ultra' : ''}`}
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="mono mt-1.5 flex items-center justify-between text-[10px] text-ink-soft">
                <span>
                  {row.moves_completed}/{required} merges
                </span>
                <span>
                  {row.round_wins} round{row.round_wins === 1 ? '' : 's'} won
                </span>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="border border-dashed border-rule px-4 py-8 text-center">
            <Database size={16} className="mx-auto text-ink-faint" />
            <p className="mono mt-2 text-[10px] leading-relaxed text-ink-soft">
              {isLoading
                ? 'opening the local replica'
                : 'no telemetry rows synced for this room yet'}
            </p>
          </div>
        )}
      </div>

      <div className="mono border-t border-rule px-5 py-3 text-[10px] leading-relaxed text-ink-soft">
        queried from this browser&apos;s PowerSync replica
      </div>
    </aside>
  );
}
