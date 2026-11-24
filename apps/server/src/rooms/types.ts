import type { BotTier, Difficulty, RoomPhase } from '@numera/shared';
import type { GeneratedPuzzle } from '../engine/puzzle-generator';
import type { PlayerBoardState } from '../engine/rule-engine';

export interface SocketSink {
  send(data: string): void;
}

export interface PlayerRuntime {
  userId: string;
  playerName: string;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
  score: number;
  roundWins: number;
  totalSolveMs: number;
  solveCount: number;
  reconnectToken: string;
  socket: SocketSink | null;
  board: PlayerBoardState;
  movesCompleted: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

export interface RoundRuntime {
  roundNumber: number;
  puzzle: GeneratedPuzzle;
  target: number;
  movesRequired: number;
  roundDurationMs: number;
  startedAtMs: number;
  deadlineMs: number;
  resolved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  botRunner: { stop: () => void } | null;
}

export interface RoomRuntime {
  code: string;
  mode: 'pvp' | 'bot';
  botTier: BotTier | null;
  difficulty: Difficulty;
  totalRounds: number;
  currentRound: number;
  phase: RoomPhase;
  players: Map<string, PlayerRuntime>;
  round: RoundRuntime | null;
  createdAt: number;
  lastActivityAt: number;
  transitionTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}
