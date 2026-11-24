import {
  BOT_PROFILES,
  BOT_TIERS,
  type BotTier,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  type Difficulty,
  MAX_PLAYERS,
  ROUND_COUNTS,
  type RoundCount,
  normalizeRoomCode,
} from '@numera/shared';
import { ArrowRight, Copy, DoorOpen, Hash, Swords } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { useGameStore } from '../store/game-store';

const BOT_NOTES: Record<BotTier, string> = {
  rookie: 'patient, slips sometimes',
  tactician: 'sharp, rarely slips',
  grandmaster: 'no detours',
};

function ProofExpression() {
  return (
    <div className="display flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[clamp(1.85rem,4.2vw,2.85rem)]">
      <span>8</span>
      <span className="text-saffron">÷</span>
      <span className="text-ink-soft">(</span>
      <span>3</span>
      <span className="text-saffron">−</span>
      <span className="frac text-[0.62em]">
        <span>8</span>
        <span>3</span>
      </span>
      <span className="text-ink-soft">)</span>
      <span className="text-ink-soft">=</span>
      <span className="text-ultra">24</span>
    </div>
  );
}

export function LobbyView() {
  const createRoom = useGameStore((state) => state.createRoom);
  const joinRoom = useGameStore((state) => state.joinRoom);
  const wsStatus = useGameStore((state) => state.wsStatus);

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [totalRounds, setTotalRounds] = useState<RoundCount>(1);
  const [botTier, setBotTier] = useState<BotTier>('rookie');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room');
    if (code) setRoomCode(normalizeRoomCode(code));
  }, []);

  const preset = DIFFICULTIES[difficulty];
  const online = wsStatus === 'connected';

  return (
    <main className="pb-20 pt-10 sm:pt-14">
      <section className="shell grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-16 lg:gap-y-9">
        <div className="hero-copy lg:col-start-1 lg:row-start-1">
          <div className="rise flex flex-wrap items-center gap-3">
            <span className="mono text-[11px] tracking-[0.14em] text-ink-soft">
              server-authoritative
            </span>
            <span className="h-3 w-px bg-rule" aria-hidden="true" />
            <span className="mono text-[11px] tracking-[0.14em] text-ink-soft">
              exact rationals
            </span>
            <span className="hidden h-3 w-px bg-rule sm:block" aria-hidden="true" />
            <span className="mono hidden text-[11px] tracking-[0.14em] text-ink-soft sm:inline">
              two players
            </span>
          </div>

          <h1
            className="display rise mt-6 text-[clamp(2.15rem,5.2vw,4.1rem)]"
            style={{ '--i': 1 } as CSSProperties}
          >
            Hit the number.
            <br />
            Use every card.
            <br />
            <span className="text-ink-soft">Keep it exact.</span>
          </h1>

          <p className="rise mt-6 max-w-[48ch] text-[15px] leading-[1.65] text-ink-soft">
            A head-to-head arithmetic arena. Combine your cards with{' '}
            <span className="whitespace-nowrap">+ − × ÷</span> to reach the target before your rival
            does. Values are exact fractions, so the solve above really is twenty-four, and only the
            server decides who got there first.
          </p>
        </div>

        <div
          className="rise lg:col-start-2 lg:row-span-2 lg:row-start-1"
          style={{ '--i': 1 } as CSSProperties}
        >
          <div className="sheet sheet-lift">
            <div className="flex items-baseline justify-between gap-3 border-b border-ink px-5 py-4">
              <h2 className="display text-[1.35rem]">Set the table</h2>
              <span className="mono text-[10px] text-ink-soft">
                {preset.movesRequired} merges, {preset.roundDurationMs / 1000}s
              </span>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div>
                <p className="label">difficulty</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {DIFFICULTY_ORDER.map((key) => {
                    const config = DIFFICULTIES[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={difficulty === key}
                        onClick={() => setDifficulty(key)}
                        className="choice"
                      >
                        <span className="block text-[13px] font-medium">
                          {DIFFICULTY_LABELS[key]}
                        </span>
                        <span className="choice-note block">
                          {config.cardCount} cards, {config.roundDurationMs / 1000}s limit
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="label">rounds</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {ROUND_COUNTS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={totalRounds === count}
                      onClick={() => setTotalRounds(count)}
                      className="choice text-center"
                    >
                      <span className="mono text-[13px] font-medium">{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="label">opponent</p>
                <div className="mt-2 space-y-1.5">
                  {BOT_TIERS.map((tier) => {
                    const profile = BOT_PROFILES[tier];
                    return (
                      <button
                        key={tier}
                        type="button"
                        aria-pressed={botTier === tier}
                        onClick={() => setBotTier(tier)}
                        className="choice flex w-full items-baseline justify-between gap-3"
                      >
                        <span className="text-[13px] font-medium">
                          {profile.name.replace(' Bot', '')}
                        </span>
                        <span className="choice-note min-w-0 truncate text-right">
                          {profile.elo} elo, {BOT_NOTES[tier]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => createRoom({ difficulty, totalRounds, mode: 'bot', botTier })}
                  disabled={!online}
                  className="btn btn-solid btn-lg btn-block"
                >
                  Start bot duel
                  <ArrowRight size={15} />
                </button>
                <p className="mono mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] text-ink-soft">
                  <DoorOpen size={11} />
                  {online ? 'authoritative server online' : 'connecting to the game server'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <figure className="rise border-y border-ink py-6">
            <figcaption className="mono text-[11px] tracking-[0.14em] text-ink-soft">
              solved board, easy tier
            </figcaption>
            <div className="mt-3">
              <ProofExpression />
            </div>
            <p className="mono mt-3 text-[11px] text-ink-soft">
              4 cards used once, 3 merges, trace replayed and verified server-side
            </p>
          </figure>

          <div
            className="rise mt-8 grid max-w-[34rem] grid-cols-3 gap-4"
            style={{ '--i': 2 } as CSSProperties}
          >
            {[
              { value: String(DIFFICULTY_ORDER.length), label: 'difficulty tiers' },
              { value: String(MAX_PLAYERS), label: 'players per room' },
              { value: '0', label: 'floating-point moves' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="display text-[2rem] leading-none">{stat.value}</div>
                <div className="mono mt-1 text-[11px] leading-tight text-ink-soft">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shell mt-12 grid gap-6 md:grid-cols-2">
        <div className="sheet flex flex-col p-5">
          <div className="flex items-center gap-2">
            <Swords size={15} className="text-ink-soft" />
            <h2 className="display text-[1.2rem]">Host a private duel</h2>
          </div>
          <p className="mt-1.5 max-w-[40ch] text-[13px] text-ink-soft">
            You get a six-character code and a link. The match begins the moment both players are
            ready.
          </p>

          <dl className="mt-5">
            <div className="ledger-row">
              <dt className="text-ink-soft">board</dt>
              <dd className="mono">{preset.cardCount} cards</dd>
            </div>
            <div className="ledger-row">
              <dt className="text-ink-soft">clock</dt>
              <dd className="mono">{preset.roundDurationMs / 1000}s per round</dd>
            </div>
            <div className="ledger-row">
              <dt className="text-ink-soft">target window</dt>
              <dd className="mono">
                {preset.targetMin}–{preset.targetMax}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => createRoom({ difficulty, totalRounds, mode: 'pvp' })}
            disabled={!online}
            className="btn btn-block mt-6"
          >
            Create room
            <ArrowRight size={15} />
          </button>
        </div>

        <div className="sheet flex flex-col p-5">
          <div className="flex items-center gap-2">
            <Hash size={15} className="text-ink-soft" />
            <h2 className="display text-[1.2rem]">Join with a code</h2>
          </div>
          <p className="mt-1.5 max-w-[40ch] text-[13px] text-ink-soft">
            Paste the code your opponent sent you. Invite links open this page with the field ready.
          </p>

          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              joinRoom(roomCode);
            }}
          >
            <label className="label block" htmlFor="room-code">
              room code
            </label>
            <input
              id="room-code"
              value={roomCode}
              onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
              placeholder="ABC123"
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              className="field mt-2 text-center text-xl font-medium tracking-[0.34em] uppercase"
            />
            <button
              type="submit"
              disabled={!online || roomCode.length !== 6}
              className="btn btn-block mt-2"
            >
              Join match
              <ArrowRight size={15} />
            </button>
          </form>

          <p className="mono mt-auto flex items-start gap-1.5 pt-5 text-[10px] leading-relaxed text-ink-soft">
            <Copy size={11} className="mt-0.5 shrink-0" />
            links use ?room=XXXXXX and prefill this field
          </p>
        </div>
      </section>

      <section className="shell mt-14">
        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-ink pt-5">
          <h2 className="display text-[clamp(1.45rem,2.4vw,1.85rem)]">A round, in three moves</h2>
          <span className="mono text-[11px] text-ink-soft">
            one clock, both players, the same deal
          </span>
        </div>

        <ol className="mt-5 grid gap-px overflow-hidden border border-ink bg-rule sm:grid-cols-3">
          {[
            {
              index: '01',
              title: 'Deal',
              body: 'Four to seven cards land on both boards, plus a target inside the tier window.',
            },
            {
              index: '02',
              title: 'Merge',
              body: 'Pick a card, an operator, then a second card. Every merge is an exact rational, checked server-side.',
            },
            {
              index: '03',
              title: 'Hit it',
              body: 'Use every card to land exactly on the target before your rival. Speed sets the points.',
            },
          ].map((step) => (
            <li key={step.index} className="bg-paper px-5 py-6">
              <span className="mono text-[10px] tracking-[0.16em] text-ultra">{step.index}</span>
              <h3 className="display mt-3 text-[1.35rem]">{step.title}</h3>
              <p className="mt-2 max-w-[34ch] text-[13px] leading-[1.6] text-ink-soft">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="shell mt-10 flex flex-wrap items-baseline justify-between gap-3 border-t border-ink pt-4">
        <span className="mono text-[11px] text-ink-soft">
          every merge is an exact rational, scored server-side
        </span>
        <span className="mono text-[11px] text-ink-soft">
          race + standings read from a local PowerSync replica
        </span>
      </footer>
    </main>
  );
}
