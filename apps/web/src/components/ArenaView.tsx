import { BOT_PROFILES, DIFFICULTY_LABELS } from '@numera/shared';
import { Bot, LogOut, Swords } from 'lucide-react';
import { useGameStore } from '../store/game-store';
import { CardBoard } from './CardBoard';
import { LiveRacePanel } from './LiveRacePanel';
import { TargetBanner } from './TargetBanner';

export function ArenaView() {
  const room = useGameStore((state) => state.room);
  const userId = useGameStore((state) => state.userId);
  const leaveRoom = useGameStore((state) => state.leaveRoom);

  if (!room) return null;

  const me = room.players.find((player) => player.userId === userId);
  const bot = room.players.find((player) => player.isBot);
  const opponent = room.players.find((player) => !player.isBot && player.userId !== userId);
  const opponentName = bot
    ? BOT_PROFILES[room.botTier ?? 'rookie'].name
    : (opponent?.playerName ?? 'Opponent');
  const opponentOnline = bot ? true : Boolean(opponent?.connected);
  const rivalScore = room.players.find((player) => player.userId !== userId)?.score ?? 0;

  return (
    <main className="shell pb-16 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-ink pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="tag text-[13px] tracking-[0.18em]">{room.roomCode}</span>
          <span className="mono hidden text-[11px] text-ink-soft sm:inline">
            {DIFFICULTY_LABELS[room.difficulty]}, {room.totalRounds}{' '}
            {room.totalRounds === 1 ? 'round' : 'rounds'}
          </span>
          <span className="mono flex items-center gap-1.5 text-[11px] text-ink-soft">
            {bot ? <Bot size={12} /> : <Swords size={12} />}
            {opponentName}
            <span
              className={`dot ${opponentOnline ? 'text-forest' : 'text-rust'}`}
              aria-hidden="true"
            />
          </span>
        </div>

        <div className="flex items-end gap-4">
          <div className="hidden items-end gap-4 sm:flex">
            <div>
              <p className="label">you</p>
              <p className="mono mt-1 text-[1.2rem] leading-none font-medium">{me?.score ?? 0}</p>
            </div>
            <div>
              <p className="label">rival</p>
              <p className="mono mt-1 text-[1.2rem] leading-none font-medium">{rivalScore}</p>
            </div>
          </div>
          <button type="button" onClick={leaveRoom} className="btn btn-quiet px-3 py-1.5 text-xs">
            <LogOut size={13} /> Leave
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <TargetBanner />
          <CardBoard />
        </div>
        <LiveRacePanel />
      </div>
    </main>
  );
}
