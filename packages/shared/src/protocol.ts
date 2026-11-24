import { z } from 'zod';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'scott_wu';
export type Operator = '+' | '-' | '*' | '/';
export type BotTier = 'rookie' | 'tactician' | 'grandmaster';
export type RoomPhase = 'waiting' | 'playing' | 'round_over' | 'match_over';
export type GameMode = 'pvp' | 'bot';
export type RoundCount = 1 | 3 | 5;

export interface CardDTO {
  /** "c_0".."c_6" initially; "m_1", "m_2"... on combine. */
  id: string;
  /** BigInt serialized to decimal string. */
  num: string;
  /** Positive BigInt serialized to decimal string ("1" for integers). */
  den: string;
  /** "24" if den === "1", else "8/3". */
  display: string;
  /** "(12 - (6 + 4))". */
  expr: string;
}

export interface RoomPlayerDTO {
  userId: string;
  playerName: string;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
  score: number;
  roundWins: number;
  movesCompleted: number;
}

export interface MatchStandingDTO {
  userId: string;
  playerName: string;
  isBot: boolean;
  score: number;
  roundsWon: number;
  avgSolveMs: number;
  eloBefore: number;
  eloAfter: number;
}

export const DifficultySchema = z.enum(['easy', 'medium', 'hard', 'scott_wu']);
export const OperatorSchema = z.enum(['+', '-', '*', '/']);
export const BotTierSchema = z.enum(['rookie', 'tactician', 'grandmaster']);
export const RoomPhaseSchema = z.enum(['waiting', 'playing', 'round_over', 'match_over']);
export const GameModeSchema = z.enum(['pvp', 'bot']);
export const RoundCountSchema = z.union([z.literal(1), z.literal(3), z.literal(5)]);
export const ErrorCodeSchema = z.enum([
  'INVALID_MOVE',
  'DIV_BY_ZERO',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'UNAUTHORIZED',
  'STALE_ROUND',
  'BAD_PAYLOAD',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const CardDTOSchema = z.object({
  id: z.string().min(1),
  num: z.string(),
  den: z.string(),
  display: z.string(),
  expr: z.string(),
});

export const RoomPlayerDTOSchema = z.object({
  userId: z.string(),
  playerName: z.string(),
  isBot: z.boolean(),
  ready: z.boolean(),
  connected: z.boolean(),
  score: z.number().int(),
  roundWins: z.number().int(),
  movesCompleted: z.number().int(),
});

export const MatchStandingDTOSchema = z.object({
  userId: z.string(),
  playerName: z.string(),
  isBot: z.boolean(),
  score: z.number().int(),
  roundsWon: z.number().int(),
  avgSolveMs: z.number().int(),
  eloBefore: z.number().int(),
  eloAfter: z.number().int(),
});

const PlayerNameSchema = z.string().trim().min(1).max(24);
const RoomCodeSchema = z.string().min(4).max(12);

/* ------------------------------------------------------------------ */
/* Client -> Server                                                    */
/* ------------------------------------------------------------------ */

export const AuthMessageSchema = z.object({
  type: z.literal('AUTH'),
  token: z.string().min(1),
  playerName: PlayerNameSchema,
});

export const CreateRoomMessageSchema = z.object({
  type: z.literal('CREATE_ROOM'),
  difficulty: DifficultySchema,
  totalRounds: RoundCountSchema,
  mode: GameModeSchema,
  botTier: BotTierSchema.optional(),
});

export const JoinRoomMessageSchema = z.object({
  type: z.literal('JOIN_ROOM'),
  roomCode: RoomCodeSchema,
});

export const ReconnectRoomMessageSchema = z.object({
  type: z.literal('RECONNECT_ROOM'),
  roomCode: RoomCodeSchema,
  reconnectToken: z.string().min(1),
});

export const SetReadyMessageSchema = z.object({
  type: z.literal('SET_READY'),
  ready: z.boolean(),
});

export const MakeMoveMessageSchema = z.object({
  type: z.literal('MAKE_MOVE'),
  roundNumber: z.number().int().nonnegative(),
  cardAId: z.string().min(1),
  cardBId: z.string().min(1),
  operator: OperatorSchema,
});

export const UndoMoveMessageSchema = z.object({
  type: z.literal('UNDO_MOVE'),
  roundNumber: z.number().int().nonnegative(),
});

export const ResetBoardMessageSchema = z.object({
  type: z.literal('RESET_BOARD'),
  roundNumber: z.number().int().nonnegative(),
});

export const RematchMessageSchema = z.object({
  type: z.literal('REMATCH'),
});

export const LeaveRoomMessageSchema = z.object({
  type: z.literal('LEAVE_ROOM'),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  AuthMessageSchema,
  CreateRoomMessageSchema,
  JoinRoomMessageSchema,
  ReconnectRoomMessageSchema,
  SetReadyMessageSchema,
  MakeMoveMessageSchema,
  UndoMoveMessageSchema,
  ResetBoardMessageSchema,
  RematchMessageSchema,
  LeaveRoomMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type AuthMessage = z.infer<typeof AuthMessageSchema>;
export type CreateRoomMessage = z.infer<typeof CreateRoomMessageSchema>;
export type JoinRoomMessage = z.infer<typeof JoinRoomMessageSchema>;
export type ReconnectRoomMessage = z.infer<typeof ReconnectRoomMessageSchema>;
export type SetReadyMessage = z.infer<typeof SetReadyMessageSchema>;
export type MakeMoveMessage = z.infer<typeof MakeMoveMessageSchema>;
export type UndoMoveMessage = z.infer<typeof UndoMoveMessageSchema>;
export type ResetBoardMessage = z.infer<typeof ResetBoardMessageSchema>;
export type RematchMessage = z.infer<typeof RematchMessageSchema>;
export type LeaveRoomMessage = z.infer<typeof LeaveRoomMessageSchema>;

/* ------------------------------------------------------------------ */
/* Server -> Client                                                    */
/* ------------------------------------------------------------------ */

export const AuthOkMessageSchema = z.object({
  type: z.literal('AUTH_OK'),
  userId: z.string(),
  playerName: z.string(),
});

export const RoomStateMessageSchema = z.object({
  type: z.literal('ROOM_STATE'),
  roomCode: z.string(),
  reconnectToken: z.string(),
  mode: GameModeSchema,
  botTier: BotTierSchema.nullable(),
  difficulty: DifficultySchema,
  phase: RoomPhaseSchema,
  totalRounds: z.number().int(),
  currentRound: z.number().int(),
  serverTimeMs: z.number(),
  deadlineMs: z.number().nullable(),
  target: z.number().nullable(),
  movesRequired: z.number().int(),
  players: z.array(RoomPlayerDTOSchema),
  cards: z.array(CardDTOSchema),
  canUndo: z.boolean(),
  movesCompleted: z.number().int(),
});

export const BoardUpdateMessageSchema = z.object({
  type: z.literal('BOARD_UPDATE'),
  roundNumber: z.number().int(),
  cards: z.array(CardDTOSchema),
  canUndo: z.boolean(),
  movesCompleted: z.number().int(),
});

export const OpponentProgressMessageSchema = z.object({
  type: z.literal('OPPONENT_PROGRESS'),
  userId: z.string(),
  movesCompleted: z.number().int(),
  movesRequired: z.number().int(),
});

export const RoundOverMessageSchema = z.object({
  type: z.literal('ROUND_OVER'),
  roundNumber: z.number().int(),
  winnerUserId: z.string().nullable(),
  winnerName: z.string().nullable(),
  pointsAwarded: z.number().int(),
  winningExpr: z.string().nullable(),
  optimalExpr: z.string(),
  optimalSteps: z.array(z.string()),
  scores: z.record(z.number()),
  roundWins: z.record(z.number()),
  nextRoundAtMs: z.number().nullable(),
});

export const MatchOverMessageSchema = z.object({
  type: z.literal('MATCH_OVER'),
  matchId: z.string(),
  winnerUserId: z.string().nullable(),
  standings: z.array(MatchStandingDTOSchema),
});

export const ErrorMessageSchema = z.object({
  type: z.literal('ERROR'),
  code: ErrorCodeSchema,
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  AuthOkMessageSchema,
  RoomStateMessageSchema,
  BoardUpdateMessageSchema,
  OpponentProgressMessageSchema,
  RoundOverMessageSchema,
  MatchOverMessageSchema,
  ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type AuthOkMessage = z.infer<typeof AuthOkMessageSchema>;
export type RoomStateMessage = z.infer<typeof RoomStateMessageSchema>;
export type BoardUpdateMessage = z.infer<typeof BoardUpdateMessageSchema>;
export type OpponentProgressMessage = z.infer<typeof OpponentProgressMessageSchema>;
export type RoundOverMessage = z.infer<typeof RoundOverMessageSchema>;
export type MatchOverMessage = z.infer<typeof MatchOverMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
