import { X } from 'lucide-react';
import { useEffect } from 'react';
import { ArenaView } from './components/ArenaView';
import { HeaderBar } from './components/HeaderBar';
import { InkField } from './components/InkField';
import { LeaderboardDrawer } from './components/LeaderboardDrawer';
import { LobbyView } from './components/LobbyView';
import { MatchOverModal } from './components/MatchOverModal';
import { RoundSummaryModal } from './components/RoundSummaryModal';
import { WaitingRoom } from './components/WaitingRoom';
import { readDevScene, seedDevScene } from './lib/dev-seed';
import { useGameStore } from './store/game-store';

function ErrorToast() {
  const error = useGameStore((state) => state.error);
  const dismiss = useGameStore((state) => state.dismissError);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(dismiss, 6000);
    return () => window.clearTimeout(timeout);
  }, [error, dismiss]);

  if (!error) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex max-w-lg items-start gap-3 border border-ink bg-ink px-4 py-3 text-paper shadow-[5px_5px_0_rgba(21,23,15,0.25)]"
      >
        <span className="mono mt-0.5 shrink-0 text-[9px] tracking-[0.1em] text-saffron">
          {error.code.toLowerCase().replaceAll('_', ' ')}
        </span>
        <p className="min-w-0 text-[12px] leading-snug">{error.message}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss error"
          className="ml-1 shrink-0 text-paper/60 transition hover:text-paper"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const connect = useGameStore((state) => state.connect);
  const room = useGameStore((state) => state.room);

  const devScene = readDevScene();

  useEffect(() => {
    if (devScene) {
      seedDevScene(devScene);
      return;
    }
    connect();
  }, [connect, devScene]);

  const showWaitingRoom = room !== null && room.mode === 'pvp' && room.phase === 'waiting';
  const fieldIntensity = room === null ? 0.4 : room.phase === 'playing' ? 1 : 0.65;
  const showLeaderboard = devScene === null;

  return (
    <>
      <InkField intensity={fieldIntensity} />
      <div className="app-layer">
        <HeaderBar />
        {!room ? <LobbyView /> : showWaitingRoom ? <WaitingRoom /> : <ArenaView />}
        {showLeaderboard ? <LeaderboardDrawer /> : null}
        <RoundSummaryModal />
        <MatchOverModal />
        <ErrorToast />
      </div>
    </>
  );
}
