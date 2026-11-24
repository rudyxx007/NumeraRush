import { useStatus } from '@powersync/react';
import { Check, Pencil, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useGameStore } from '../store/game-store';

function Readout({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className="mono flex items-center gap-1.5 text-[10px] whitespace-nowrap text-ink-soft">
      <span className={`dot ${tone}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function HeaderBar() {
  const playerName = useGameStore((state) => state.playerName);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const wsStatus = useGameStore((state) => state.wsStatus);
  const toggleLeaderboard = useGameStore((state) => state.toggleLeaderboard);
  const syncStatus = useStatus();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(playerName);

  const commit = (): void => {
    setPlayerName(draft);
    setEditing(false);
  };

  const wsTone =
    wsStatus === 'connected'
      ? 'text-forest'
      : wsStatus === 'connecting'
        ? 'text-saffron'
        : 'text-ink-faint';
  const wsLabel = wsStatus === 'connected' ? 'live' : wsStatus === 'connecting' ? 'dialing' : 'off';

  const synced = syncStatus.connected && syncStatus.hasSynced;
  const syncTone = synced
    ? 'text-forest'
    : syncStatus.connecting || syncStatus.connected
      ? 'text-saffron'
      : 'text-ink-faint';
  const syncLabel = synced
    ? 'synced'
    : syncStatus.connecting || syncStatus.connected
      ? 'syncing'
      : 'off';

  return (
    <header className="sticky top-0 z-40 border-b border-ink bg-paper">
      <div className="shell flex h-16 items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className="display grid h-8 w-8 place-items-center border border-ink bg-ink text-[17px] text-paper"
            aria-hidden="true"
          >
            ÷
          </span>
          <div className="leading-none">
            <span className="display text-[1.15rem] tracking-[-0.04em]">numerarush</span>
            <span className="mono mt-1 hidden text-[9px] tracking-[0.16em] text-ink-soft sm:block">
              exact arithmetic arena
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          <div className="hidden items-center gap-3 lg:flex">
            <Readout tone={wsTone}>ws {wsLabel}</Readout>
            <Readout tone={syncTone}>sqlite {syncLabel}</Readout>
            <span className="h-5 w-px bg-rule" aria-hidden="true" />
          </div>

          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                commit();
              }}
              className="flex items-center gap-1 border border-ink bg-card px-1.5 py-1"
            >
              <input
                value={draft}
                maxLength={24}
                aria-label="Display name"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(false);
                }}
                className="w-24 bg-transparent font-sans text-xs font-medium text-ink outline-none"
              />
              <button
                type="submit"
                className="text-forest transition hover:text-ink"
                aria-label="Save display name"
              >
                <Check size={14} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(playerName);
                setEditing(true);
              }}
              className="group flex items-center gap-1.5 border-b border-transparent py-1 text-[13px] font-medium text-ink transition hover:border-ink"
            >
              <span className="max-w-[8rem] truncate">{playerName}</span>
              <Pencil size={11} className="text-ink-faint transition group-hover:text-ink" />
            </button>
          )}

          <button
            type="button"
            onClick={() => toggleLeaderboard()}
            className="btn btn-quiet px-2.5 py-1.5"
            aria-label="Open leaderboard"
          >
            <Trophy size={14} />
            <span className="hidden sm:inline">Standings</span>
          </button>
        </div>
      </div>

      <div className="shell flex items-center gap-3 pb-2 lg:hidden">
        <Readout tone={wsTone}>ws {wsLabel}</Readout>
        <Readout tone={syncTone}>sqlite {syncLabel}</Readout>
      </div>
    </header>
  );
}
