import { DIFFICULTY_LABELS } from '@numera/shared';
import { Check, Copy, Loader2, LogOut, UserCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { exitRoom } from '../lib/route';
import { useGameStore } from '../store/game-store';

export function WaitingRoom() {
  const room = useGameStore((state) => state.room);
  const userId = useGameStore((state) => state.userId);
  const setReady = useGameStore((state) => state.setReady);
  const [copied, setCopied] = useState(false);

  if (!room) return null;

  const me = room.players.find((player) => player.userId === userId);
  const inviteLink = `${window.location.origin}/?room=${room.roomCode}`;
  const isReady = Boolean(me?.ready);

  const copyInvite = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="shell max-w-3xl pt-12 pb-20">
      <p className="mono text-[10px] tracking-[0.14em] text-ink-soft">
        private duel, {DIFFICULTY_LABELS[room.difficulty].toLowerCase()}, {room.totalRounds}{' '}
        {room.totalRounds === 1 ? 'round' : 'rounds'}
      </p>
      <h1 className="display mt-3 text-[clamp(2rem,4.6vw,2.9rem)]">Waiting for a challenger</h1>
      <p className="mt-3 max-w-[46ch] text-[14px] text-ink-soft">
        Share the code or the link. The match starts the moment both players are ready.
      </p>

      <div className="sheet sheet-lift mt-8">
        <div className="border-b border-ink px-6 py-7 text-center">
          <p className="label">room code</p>
          <div className="mono mt-2 text-[clamp(2.1rem,7vw,3.3rem)] leading-none font-medium tracking-[0.3em]">
            {room.roomCode}
          </div>
          <p className="mono mt-4 truncate text-[10px] text-ink-soft">{inviteLink}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={copyInvite} className="btn px-3 py-1.5">
              {copied ? <Check size={13} className="text-forest" /> : <Copy size={13} />}
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
            <button type="button" onClick={exitRoom} className="btn btn-quiet px-3 py-1.5">
              <LogOut size={13} /> Leave
            </button>
          </div>
        </div>

        <div className="divide-y divide-rule border-b border-ink">
          {[0, 1].map((slot) => {
            const player = room.players[slot];
            if (!player) {
              return (
                <div key={`empty-${slot}`} className="flex items-center gap-3 px-6 py-4">
                  <span className="grid h-9 w-9 place-items-center border border-dashed border-rule text-ink-faint">
                    <UserPlus size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-soft">Open seat</p>
                    <p className="mono text-[10px] text-ink-faint">waiting for an opponent</p>
                  </div>
                  <Loader2 size={14} className="ml-auto animate-spin text-ink-faint" />
                </div>
              );
            }

            const isMe = player.userId === userId;
            return (
              <div key={player.userId} className="flex items-center gap-3 px-6 py-4">
                <span
                  className={`grid h-9 w-9 place-items-center border text-[13px] font-medium ${
                    isMe ? 'border-ultra bg-ultra text-white' : 'border-ink bg-card text-ink'
                  }`}
                >
                  {player.playerName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5 text-[13px] font-medium">
                    <span className="truncate">{player.playerName}</span>
                    {isMe && (
                      <span className="mono text-[9px] tracking-[0.1em] text-ultra uppercase">
                        you
                      </span>
                    )}
                  </p>
                  <p className="mono text-[10px] text-ink-soft">
                    {player.ready ? 'ready' : 'not ready'},{' '}
                    {player.connected ? 'online' : 'offline'}
                  </p>
                </div>
                <span
                  className={`dot ml-auto ${player.ready ? 'text-forest' : 'text-saffron'}`}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>

        <div className="px-6 py-5">
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="label">difficulty</dt>
              <dd className="mt-1 text-[13px] font-medium">{DIFFICULTY_LABELS[room.difficulty]}</dd>
            </div>
            <div>
              <dt className="label">rounds</dt>
              <dd className="mono mt-1 text-[13px] font-medium">{room.totalRounds}</dd>
            </div>
            <div>
              <dt className="label">cards</dt>
              <dd className="mono mt-1 text-[13px] font-medium">{room.movesRequired + 1}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => setReady(!isReady)}
            disabled={!me}
            className={`btn btn-block btn-lg mt-5 ${isReady ? 'btn-quiet' : 'btn-solid'}`}
          >
            {isReady ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Ready, waiting for opponent
              </>
            ) : (
              <>
                <UserCheck size={15} /> I&apos;m ready
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
