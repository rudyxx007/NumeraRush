import {
  type CardDTO,
  DIFFICULTIES,
  type Difficulty,
  type MatchOverMessage,
  type RoomStateMessage,
  type RoundOverMessage,
} from '@numera/shared';
import { useGameStore } from '../store/game-store';
import { powerSyncDb } from './powersync-db';

/**
 * Dev-only fixtures for reviewing screens that normally need a live server.
 * Reachable with `?dev=arena|waiting|summary|matchover` in `vite dev` builds;
 * production builds return null from `readDevScene`.
 */
export const DEV_SCENES = ['arena', 'waiting', 'summary', 'matchover'] as const;
export type DevScene = (typeof DEV_SCENES)[number];

export const ME = 'dev-me';
export const RIVAL = 'dev-rival';

const ROOM_CODE = 'RUSH24';
const NOW = Date.now();

const BOARD_FRACTIONS: Partial<Record<Difficulty, { index: number; num: number; den: number }>> = {
  easy: { index: 2, num: 8, den: 3 },
  medium: { index: 3, num: 13, den: 4 },
  scott_wu: { index: 4, num: 22, den: 7 },
};

const BOARD_NUMBERS: Record<Difficulty, number[]> = {
  easy: [8, 3, 8, 3],
  medium: [9, 4, 12, 5, 7],
  hard: [14, 6, 3, 9, 5, 20],
  scott_wu: [22, 7, 13, 4, 25, 9, 6],
};

const TARGETS: Record<Difficulty, number> = {
  easy: 24,
  medium: 100,
  hard: 500,
  scott_wu: 1234,
};

function buildBoard(difficulty: Difficulty): CardDTO[] {
  const fraction = BOARD_FRACTIONS[difficulty];
  return BOARD_NUMBERS[difficulty].map((num, index) => {
    if (fraction && fraction.index === index) {
      return {
        id: `c_${index}`,
        num: String(fraction.num),
        den: String(fraction.den),
        display: `${fraction.num}/${fraction.den}`,
        expr: `(${fraction.num} ÷ ${fraction.den})`,
      };
    }
    return {
      id: `c_${index}`,
      num: String(num),
      den: '1',
      display: String(num),
      expr: String(num),
    };
  });
}

export function readDevScene(): DevScene | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get('dev');
  return (DEV_SCENES as readonly string[]).includes(value ?? '') ? (value as DevScene) : null;
}

interface Scene {
  room: RoomStateMessage;
  summary: RoundOverMessage | null;
  matchOver: MatchOverMessage | null;
}

function arenaRoom(): RoomStateMessage {
  const difficulty: Difficulty = 'medium';
  const preset = DIFFICULTIES[difficulty];
  return {
    type: 'ROOM_STATE',
    roomCode: ROOM_CODE,
    reconnectToken: 'dev-token',
    mode: 'bot',
    botTier: 'tactician',
    difficulty,
    phase: 'playing',
    totalRounds: 3,
    currentRound: 2,
    serverTimeMs: NOW,
    deadlineMs: NOW + 47_000,
    target: TARGETS[difficulty],
    movesRequired: preset.movesRequired,
    players: [
      {
        userId: ME,
        playerName: 'Player',
        isBot: false,
        ready: true,
        connected: true,
        score: 1840,
        roundWins: 1,
        movesCompleted: 2,
      },
      {
        userId: RIVAL,
        playerName: 'Tactician Bot',
        isBot: true,
        ready: true,
        connected: true,
        score: 1520,
        roundWins: 1,
        movesCompleted: 1,
      },
    ],
    cards: buildBoard(difficulty),
    canUndo: true,
    movesCompleted: 2,
  };
}

function waitingRoom(): RoomStateMessage {
  const difficulty: Difficulty = 'scott_wu';
  return {
    type: 'ROOM_STATE',
    roomCode: 'DUEL42',
    reconnectToken: 'dev-token',
    mode: 'pvp',
    botTier: null,
    difficulty,
    phase: 'waiting',
    totalRounds: 3,
    currentRound: 0,
    serverTimeMs: NOW,
    deadlineMs: null,
    target: null,
    movesRequired: DIFFICULTIES[difficulty].movesRequired,
    players: [
      {
        userId: ME,
        playerName: 'Player',
        isBot: false,
        ready: false,
        connected: true,
        score: 0,
        roundWins: 0,
        movesCompleted: 0,
      },
      {
        userId: RIVAL,
        playerName: 'Ada',
        isBot: false,
        ready: true,
        connected: true,
        score: 0,
        roundWins: 0,
        movesCompleted: 0,
      },
    ],
    cards: [],
    canUndo: false,
    movesCompleted: 0,
  };
}

function summaryRoom(): RoomStateMessage {
  const room = arenaRoom();
  return { ...room, phase: 'round_over', deadlineMs: null, canUndo: false };
}

const SUMMARY: RoundOverMessage = {
  type: 'ROUND_OVER',
  roundNumber: 2,
  winnerUserId: ME,
  winnerName: 'Player',
  pointsAwarded: 1840,
  winningExpr: '8 ÷ (3 − 8/3) = 24',
  optimalExpr: '8 ÷ (3 − 8/3) = 24',
  optimalSteps: ['8 ÷ 3 = 8/3', '3 − 8/3 = 1/3', '8 ÷ 1/3 = 24'],
  scores: { [ME]: 1840, [RIVAL]: 1520 },
  roundWins: { [ME]: 1, [RIVAL]: 1 },
  nextRoundAtMs: NOW + 5000,
};

const MATCH_OVER: MatchOverMessage = {
  type: 'MATCH_OVER',
  matchId: 'dev-match',
  winnerUserId: ME,
  standings: [
    {
      userId: ME,
      playerName: 'Player',
      isBot: false,
      score: 3480,
      roundsWon: 2,
      avgSolveMs: 21_400,
      eloBefore: 1200,
      eloAfter: 1213,
    },
    {
      userId: RIVAL,
      playerName: 'Tactician Bot',
      isBot: true,
      score: 2960,
      roundsWon: 1,
      avgSolveMs: 27_350,
      eloBefore: 1300,
      eloAfter: 1287,
    },
  ],
};

function buildScene(scene: DevScene): Scene {
  switch (scene) {
    case 'waiting':
      return { room: waitingRoom(), summary: null, matchOver: null };
    case 'summary':
      return { room: summaryRoom(), summary: SUMMARY, matchOver: null };
    case 'matchover':
      return {
        room: { ...summaryRoom(), phase: 'match_over' },
        summary: null,
        matchOver: MATCH_OVER,
      };
    case 'arena':
      return { room: arenaRoom(), summary: null, matchOver: null };
  }
}

async function seedTelemetry(room: RoomStateMessage): Promise<void> {
  try {
    await powerSyncDb.waitForReady();
    await powerSyncDb.execute("DELETE FROM live_progress WHERE id LIKE 'dev-%'");
    for (const player of room.players) {
      await powerSyncDb.execute(
        `INSERT OR REPLACE INTO live_progress
          (id, room_code, user_id, player_name, is_bot, round_number, phase,
           moves_completed, moves_required, round_wins, score, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `dev-${room.roomCode}-${player.userId}`,
          room.roomCode,
          player.userId,
          player.playerName,
          player.isBot ? 1 : 0,
          room.currentRound,
          room.phase,
          player.movesCompleted,
          room.movesRequired,
          player.roundWins,
          player.score,
          new Date().toISOString(),
        ],
      );
    }
  } catch (error) {
    console.warn('[dev-seed] local telemetry seed failed', error);
  }
}

/** Replaces store state with a fixture room. Dev builds only; see App.tsx. */
export function seedDevScene(scene: DevScene): void {
  const { room, summary, matchOver } = buildScene(scene);
  useGameStore.setState({
    userId: ME,
    playerName: 'Player',
    wsStatus: 'connected',
    room,
    deadlineLocalMs: room.phase === 'playing' ? Date.now() + 47_000 : null,
    selectedCardId: null,
    selectedOperator: null,
    roundSummary: summary,
    matchOver,
    error: null,
  });
  void seedTelemetry(room);
}
