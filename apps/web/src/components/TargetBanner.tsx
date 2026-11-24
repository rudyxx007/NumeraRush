import { DIFFICULTIES } from '@numera/shared';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/game-store';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [active]);

  return now;
}

export function TargetBanner() {
  const room = useGameStore((state) => state.room);
  const deadlineLocalMs = useGameStore((state) => state.deadlineLocalMs);
  const playing = room?.phase === 'playing' && deadlineLocalMs !== null;
  const now = useNow(playing);

  if (!room) return null;

  const durationMs = DIFFICULTIES[room.difficulty].roundDurationMs;
  const remainingMs = deadlineLocalMs === null ? 0 : Math.max(0, deadlineLocalMs - now);
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = playing ? Math.min(1, remainingMs / durationMs) : 0;
  const urgent = playing && remainingMs <= 10_000;
  const clock = playing
    ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : '--:--';

  return (
    <section className="sheet overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex-1 px-5 py-4">
          <p className="label">target</p>
          <div className="display mt-1 text-[clamp(2.6rem,6vw,3.9rem)] text-forest">
            {room.target ?? '—'}
          </div>
        </div>
        <div className="w-px bg-rule" aria-hidden="true" />
        <div className="flex-1 px-5 py-4 text-right">
          <p className="label">clock</p>
          <div
            className={`mono mt-1 text-[clamp(2rem,5vw,3.1rem)] leading-none font-medium ${
              urgent ? 'urgent text-rust' : 'text-ink'
            }`}
          >
            {clock}
          </div>
        </div>
      </div>

      <div className="mono flex items-center justify-between gap-3 border-t border-rule px-5 py-2 text-[10px] text-ink-soft">
        <span>
          round {Math.max(room.currentRound, 1)} / {room.totalRounds}
        </span>
        <span className="hidden sm:inline">
          {room.movesRequired} merges, {room.movesRequired + 1} cards
        </span>
        <span>{playing ? `${seconds}s left` : 'clock idle'}</span>
      </div>

      <div className="track">
        <div
          className={`track-fill ${urgent ? 'track-fill-rust' : 'track-fill-ultra'}`}
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
        <div className="ticks" aria-hidden="true" />
      </div>
    </section>
  );
}
