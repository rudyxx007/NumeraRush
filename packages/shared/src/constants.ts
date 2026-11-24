import type { BotTier, Difficulty } from './protocol';

export interface DifficultyPreset {
  readonly cardCount: number;
  readonly movesRequired: number;
  readonly roundDurationMs: number;
  readonly cardMin: number;
  readonly cardMax: number;
  readonly targetMin: number;
  readonly targetMax: number;
  readonly difficultyBonus: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyPreset> = {
  easy: {
    cardCount: 4,
    movesRequired: 3,
    roundDurationMs: 60_000,
    cardMin: 1,
    cardMax: 12,
    targetMin: 10,
    targetMax: 100,
    difficultyBonus: 0,
  },
  medium: {
    cardCount: 5,
    movesRequired: 4,
    roundDurationMs: 75_000,
    cardMin: 1,
    cardMax: 15,
    targetMin: 25,
    targetMax: 400,
    difficultyBonus: 250,
  },
  hard: {
    cardCount: 6,
    movesRequired: 5,
    roundDurationMs: 90_000,
    cardMin: 1,
    cardMax: 20,
    targetMin: 100,
    targetMax: 1500,
    difficultyBonus: 500,
  },
  scott_wu: {
    cardCount: 7,
    movesRequired: 6,
    roundDurationMs: 120_000,
    cardMin: 1,
    cardMax: 25,
    targetMin: 500,
    targetMax: 9999,
    difficultyBonus: 1000,
  },
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard', 'scott_wu'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  scott_wu: 'Scott Wu',
};

export interface BotProfile {
  readonly id: string;
  readonly name: string;
  readonly elo: number;
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  readonly detourChance: number;
}

export const BOT_PROFILES: Record<BotTier, BotProfile> = {
  rookie: {
    id: 'bot:rookie',
    name: 'Rookie Bot',
    elo: 1000,
    minDelayMs: 6500,
    maxDelayMs: 11000,
    detourChance: 0.2,
  },
  tactician: {
    id: 'bot:tactician',
    name: 'Tactician Bot',
    elo: 1300,
    minDelayMs: 3500,
    maxDelayMs: 6500,
    detourChance: 0.05,
  },
  grandmaster: {
    id: 'bot:grandmaster',
    name: 'Grandmaster Bot',
    elo: 1650,
    minDelayMs: 1800,
    maxDelayMs: 3200,
    detourChance: 0,
  },
};

export const BOT_TIERS: readonly BotTier[] = ['rookie', 'tactician', 'grandmaster'];

export const STARTING_ELO = 1200;
export const ELO_K = 32;
export const BOT_ELO_CAP = 16;

export const ROUND_WIN_BASE_POINTS = 1000;
export const ROUND_WIN_SPEED_POINTS = 1000;

export const INTER_ROUND_PAUSE_MS = 5000;
export const RECONNECT_GRACE_MS = 30_000;
export const ROOM_IDLE_GC_MS = 900_000;
export const LIVE_PROGRESS_CLEANUP_MS = 60_000;

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS = 2;
export const ROUND_COUNTS: readonly (1 | 3 | 5)[] = [1, 3, 5];

export const DEFAULT_PLAYER_NAME = 'Player';

/** Server-authoritative round score: base + speed bonus + difficulty bonus. */
export function roundPoints(
  remainingMs: number,
  roundDurationMs: number,
  difficultyBonus: number,
): number {
  const clampedRemaining = Math.max(0, Math.min(remainingMs, roundDurationMs));
  return (
    ROUND_WIN_BASE_POINTS +
    Math.round((clampedRemaining / roundDurationMs) * ROUND_WIN_SPEED_POINTS) +
    difficultyBonus
  );
}

/** Normalize invite codes: uppercase, strip separators, 6 chars. */
export function normalizeRoomCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

/** Deterministic `live_progress.id` composite key. */
export function liveProgressId(roomCode: string, userId: string): string {
  return `${roomCode}:${userId}`;
}
