import {
  BOT_PROFILES,
  type BotTier,
  DIFFICULTIES,
  type Difficulty,
  type ErrorCode,
  type GameMode,
  INTER_ROUND_PAUSE_MS,
  LIVE_PROGRESS_CLEANUP_MS,
  MAX_PLAYERS,
  type MakeMoveMessage,
  type MatchStandingDTO,
  type Operator,
  RECONNECT_GRACE_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_IDLE_GC_MS,
  type ResetBoardMessage,
  type RoomPlayerDTO,
  type RoundCount,
  STARTING_ELO,
  type ServerMessage,
  type UndoMoveMessage,
  liveProgressId,
  normalizeRoomCode,
  roundPoints,
} from '@numera/shared';
import { customAlphabet, nanoid } from 'nanoid';
import type { ISupabaseRepo, LiveProgressInsert, MatchResultInsert } from '../db/supabase-repo';
import { type BotAction, startBotRunner } from '../engine/bot-runner';
import { type GeneratedPuzzle, generatePuzzle } from '../engine/puzzle-generator';
import {
  EngineError,
  applyMove,
  createInitialBoard,
  resetBoard,
  undoMove,
} from '../engine/rule-engine';
import type { PlayerRuntime, RoomRuntime, RoundRuntime, SocketSink } from './types';

const roomCodeAlphabet = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

export interface PlayerIdentity {
  userId: string;
  playerName: string;
  socket: SocketSink | null;
}

export interface CreateRoomInput {
  difficulty: Difficulty;
  totalRounds: RoundCount;
  mode: GameMode;
  botTier?: BotTier;
}

export interface RoomManagerOptions {
  repo?: ISupabaseRepo;
  now?: () => number;
  random?: () => number;
  puzzleFactory?: (difficulty: Difficulty) => GeneratedPuzzle;
  roomCodeFactory?: () => string;
  reconnectTokenFactory?: () => string;
  matchIdFactory?: () => string;
}

interface RoundOutcome {
  winnerUserId: string | null;
  winnerName: string | null;
  pointsAwarded: number;
  winningExpr: string | null;
}

interface MoveInput {
  cardAId: string;
  cardBId: string;
  operator: Operator;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly repo: ISupabaseRepo | undefined;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly puzzleFactory: (difficulty: Difficulty) => GeneratedPuzzle;
  private readonly roomCodeFactory: () => string;
  private readonly reconnectTokenFactory: () => string;
  private readonly matchIdFactory: () => string;

  constructor(options: RoomManagerOptions = {}) {
    const random = options.random ?? Math.random;
    this.repo = options.repo;
    this.now = options.now ?? (() => Date.now());
    this.random = random;
    this.puzzleFactory =
      options.puzzleFactory ?? ((difficulty) => generatePuzzle(difficulty, random));
    this.roomCodeFactory = options.roomCodeFactory ?? (() => roomCodeAlphabet());
    this.reconnectTokenFactory = options.reconnectTokenFactory ?? (() => nanoid(24));
    this.matchIdFactory = options.matchIdFactory ?? (() => `match_${nanoid(12)}`);
  }

  get activeRoomCount(): number {
    return this.rooms.size;
  }

  getRoom(roomCode: string): RoomRuntime | undefined {
    return this.rooms.get(normalizeRoomCode(roomCode));
  }

  createRoom(identity: PlayerIdentity, input: CreateRoomInput): RoomRuntime {
    this.detachExisting(identity.userId);

    const timestamp = this.now();
    const room: RoomRuntime = {
      code: this.nextRoomCode(),
      mode: input.mode,
      botTier: input.mode === 'bot' ? (input.botTier ?? 'rookie') : null,
      difficulty: input.difficulty,
      totalRounds: input.totalRounds,
      currentRound: 0,
      phase: 'waiting',
      players: new Map(),
      round: null,
      createdAt: timestamp,
      lastActivityAt: timestamp,
      transitionTimer: null,
      cleanupTimer: null,
    };
    this.rooms.set(room.code, room);

    const host = this.createHumanPlayer(identity, input.mode === 'bot');
    room.players.set(host.userId, host);

    if (input.mode === 'bot') {
      const bot = this.createBotPlayer(room.botTier ?? 'rookie');
      room.players.set(bot.userId, bot);
    }

    this.broadcastRoomState(room);
    if (input.mode === 'bot') {
      this.startRound(room, 1);
    } else {
      this.persistProgress(room);
    }

    return room;
  }

  joinRoom(roomCode: string, identity: PlayerIdentity): RoomRuntime | null {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    if (!room) {
      this.sendErrorToSocket(identity.socket, 'ROOM_NOT_FOUND', 'That room code does not exist');
      return null;
    }

    const existing = room.players.get(identity.userId);
    if (existing) {
      return this.attachSocket(room, existing, identity.socket);
    }

    if (room.players.size >= MAX_PLAYERS) {
      this.sendErrorToSocket(identity.socket, 'ROOM_FULL', 'That room already has two players');
      return null;
    }

    if (room.phase !== 'waiting') {
      this.sendErrorToSocket(identity.socket, 'ROOM_FULL', 'That match is already in progress');
      return null;
    }

    const player = this.createHumanPlayer(identity, false);
    room.players.set(player.userId, player);
    this.touch(room);
    this.broadcastRoomState(room);
    this.persistProgress(room);
    this.maybeStartPvp(room);
    return room;
  }

  reconnect(
    roomCode: string,
    reconnectToken: string,
    socket: SocketSink,
  ): { userId: string; roomCode: string } | null {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    if (!room) {
      this.sendErrorToSocket(socket, 'ROOM_NOT_FOUND', 'That room is no longer available');
      return null;
    }

    let player: PlayerRuntime | undefined;
    for (const candidate of room.players.values()) {
      if (!candidate.isBot && candidate.reconnectToken === reconnectToken) {
        player = candidate;
        break;
      }
    }

    if (!player) {
      this.sendErrorToSocket(socket, 'UNAUTHORIZED', 'Invalid reconnect token for this room');
      return null;
    }

    this.attachSocket(room, player, socket);
    return { userId: player.userId, roomCode: room.code };
  }

  setReady(userId: string, ready: boolean): void {
    const room = this.findRoomByUser(userId);
    const player = room?.players.get(userId);
    if (!room || !player) return;

    player.ready = ready;
    this.touch(room);
    this.broadcastRoomState(room);
    this.maybeStartPvp(room);
    this.persistProgress(room);
  }

  handleMove(userId: string, message: MakeMoveMessage): void {
    const room = this.findRoomByUser(userId);
    const player = room?.players.get(userId);
    if (!room || !player) return;

    const round = room.round;
    // Synchronous guard: no await before this check, so a simultaneous winning
    // move from the other player can never double-resolve the round.
    if (
      room.phase !== 'playing' ||
      !round ||
      round.resolved ||
      round.roundNumber !== message.roundNumber
    ) {
      this.sendError(player, 'STALE_ROUND', 'This round has already been resolved');
      return;
    }

    this.applyPlayerMove(room, player, message, message.roundNumber, true);
  }

  handleUndo(userId: string, message: UndoMoveMessage): void {
    const room = this.findRoomByUser(userId);
    const player = room?.players.get(userId);
    if (!room || !player) return;
    const round = room.round;

    if (
      room.phase !== 'playing' ||
      !round ||
      round.resolved ||
      round.roundNumber !== message.roundNumber
    ) {
      this.sendError(player, 'STALE_ROUND', 'This round has already been resolved');
      return;
    }

    if (player.board.history.length === 0) {
      this.sendError(player, 'INVALID_MOVE', 'There is no move to undo');
      return;
    }

    player.board = undoMove(player.board);
    player.movesCompleted = player.board.history.length;
    this.touch(room);
    this.sendBoardUpdate(player, round.roundNumber);
    this.persistProgress(room);
  }

  handleReset(userId: string, message: ResetBoardMessage): void {
    const room = this.findRoomByUser(userId);
    const player = room?.players.get(userId);
    if (!room || !player) return;
    const round = room.round;

    if (
      room.phase !== 'playing' ||
      !round ||
      round.resolved ||
      round.roundNumber !== message.roundNumber
    ) {
      this.sendError(player, 'STALE_ROUND', 'This round has already been resolved');
      return;
    }

    player.board = resetBoard(player.board);
    player.movesCompleted = 0;
    this.touch(room);
    this.sendBoardUpdate(player, round.roundNumber);
    this.persistProgress(room);
  }

  rematch(userId: string): void {
    const room = this.findRoomByUser(userId);
    const player = room?.players.get(userId);
    if (!room || !player) return;

    if (room.phase !== 'match_over') {
      this.sendError(player, 'INVALID_MOVE', 'Rematch is only available after a match ends');
      return;
    }

    this.clearRoomTimers(room);
    room.currentRound = 0;
    room.round = null;
    room.phase = 'waiting';

    for (const contestant of room.players.values()) {
      contestant.score = 0;
      contestant.roundWins = 0;
      contestant.totalSolveMs = 0;
      contestant.solveCount = 0;
      contestant.movesCompleted = 0;
      contestant.board = createInitialBoard([]);
      contestant.ready = contestant.isBot || room.mode === 'bot';
    }

    this.broadcastRoomState(room);
    this.persistProgress(room);

    if (room.mode === 'bot') {
      this.startRound(room, 1);
    } else {
      this.maybeStartPvp(room);
    }
  }

  leaveRoom(userId: string): void {
    const room = this.findRoomByUser(userId);
    const player = room?.players.get(userId);
    if (!room || !player) return;

    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    room.players.delete(userId);
    this.touch(room);

    if (this.humanCount(room) === 0) {
      this.destroyRoom(room.code);
      return;
    }

    if (room.phase === 'playing' || room.phase === 'round_over') {
      const round = room.round;
      if (round) {
        round.resolved = true;
        this.clearRoundTimers(round);
      }
      void this.finalizeMatch(room.code);
      return;
    }

    this.broadcastRoomState(room);
    this.persistProgress(room);
  }

  handleDisconnect(userId: string): void {
    const room = this.findRoomByUser(userId);
    const player = room?.players.get(userId);
    if (!room || !player || player.isBot) return;

    player.connected = false;
    player.socket = null;
    this.touch(room);

    if (room.phase === 'waiting') {
      this.leaveRoom(userId);
      return;
    }

    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
    }
    player.graceTimer = setTimeout(() => {
      player.graceTimer = null;
      this.expireGrace(room.code, userId);
    }, RECONNECT_GRACE_MS);

    this.broadcastRoomState(room);
    this.persistProgress(room);
  }

  /** Drop rooms that have been idle for 15 minutes. */
  sweepIdleRooms(now: number = this.now()): number {
    let removed = 0;
    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActivityAt >= ROOM_IDLE_GC_MS) {
        this.destroyRoom(room.code);
        removed += 1;
      }
    }
    return removed;
  }

  /* ---------------------------------------------------------------- */
  /* Runtime plumbing                                                  */
  /* ---------------------------------------------------------------- */

  private createHumanPlayer(identity: PlayerIdentity, ready: boolean): PlayerRuntime {
    return {
      userId: identity.userId,
      playerName: identity.playerName,
      isBot: false,
      ready,
      connected: identity.socket !== null,
      score: 0,
      roundWins: 0,
      totalSolveMs: 0,
      solveCount: 0,
      reconnectToken: this.reconnectTokenFactory(),
      socket: identity.socket,
      board: createInitialBoard([]),
      movesCompleted: 0,
      graceTimer: null,
    };
  }

  private createBotPlayer(tier: BotTier): PlayerRuntime {
    const profile = BOT_PROFILES[tier];
    return {
      userId: profile.id,
      playerName: profile.name,
      isBot: true,
      ready: true,
      connected: true,
      score: 0,
      roundWins: 0,
      totalSolveMs: 0,
      solveCount: 0,
      reconnectToken: this.reconnectTokenFactory(),
      socket: null,
      board: createInitialBoard([]),
      movesCompleted: 0,
      graceTimer: null,
    };
  }

  private nextRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = normalizeRoomCode(this.roomCodeFactory());
      if (code.length === ROOM_CODE_LENGTH && !this.rooms.has(code)) {
        return code;
      }
    }
    throw new Error('Unable to allocate an unused room code');
  }

  private detachExisting(userId: string): void {
    if (this.findRoomByUser(userId)) {
      this.leaveRoom(userId);
    }
  }

  private findRoomByUser(userId: string): RoomRuntime | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.has(userId)) return room;
    }
    return undefined;
  }

  private attachSocket(
    room: RoomRuntime,
    player: PlayerRuntime,
    socket: SocketSink | null,
  ): RoomRuntime {
    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    player.socket = socket;
    player.connected = socket !== null;
    this.touch(room);
    this.sendRoomState(room, player);
    this.broadcastRoomState(room, player.userId);
    this.persistProgress(room);
    return room;
  }

  private touch(room: RoomRuntime): void {
    room.lastActivityAt = this.now();
  }

  private humanCount(room: RoomRuntime): number {
    let count = 0;
    for (const player of room.players.values()) {
      if (!player.isBot) count += 1;
    }
    return count;
  }

  private maybeStartPvp(room: RoomRuntime): void {
    if (room.mode !== 'pvp' || room.phase !== 'waiting') return;
    const players = [...room.players.values()];
    if (players.length < MAX_PLAYERS) return;
    if (!players.every((player) => player.ready)) return;
    this.startRound(room, 1);
  }

  private startRound(room: RoomRuntime, roundNumber: number): void {
    const puzzle = this.puzzleFactory(room.difficulty);
    const preset = DIFFICULTIES[room.difficulty];
    const startedAtMs = this.now();

    if (room.transitionTimer) {
      clearTimeout(room.transitionTimer);
      room.transitionTimer = null;
    }
    if (room.round) {
      this.clearRoundTimers(room.round);
    }

    const round: RoundRuntime = {
      roundNumber,
      puzzle,
      target: puzzle.target,
      movesRequired: puzzle.cards.length - 1,
      roundDurationMs: preset.roundDurationMs,
      startedAtMs,
      deadlineMs: startedAtMs + preset.roundDurationMs,
      resolved: false,
      timer: null,
      botRunner: null,
    };

    room.round = round;
    room.currentRound = roundNumber;
    room.phase = 'playing';
    this.touch(room);

    for (const player of room.players.values()) {
      player.board = createInitialBoard(puzzle.cards);
      player.movesCompleted = 0;
    }

    round.timer = setTimeout(
      () => this.handleRoundTimeout(room.code, roundNumber),
      preset.roundDurationMs,
    );

    this.broadcastRoomState(room);
    this.persistProgress(room);

    if (room.mode === 'bot') {
      this.startBotForRound(room);
    }
  }

  private startBotForRound(room: RoomRuntime): void {
    const round = room.round;
    if (!round) return;
    const bot = [...room.players.values()].find((player) => player.isBot);
    if (!bot) return;

    round.botRunner = startBotRunner({
      botTier: room.botTier ?? 'rookie',
      plan: round.puzzle.botMovePlan,
      getAvailableCards: () => bot.board.cards,
      onAction: (action) => this.onBotAction(room.code, round.roundNumber, bot.userId, action),
      rand: this.random,
    });
  }

  private onBotAction(
    roomCode: string,
    roundNumber: number,
    botUserId: string,
    action: BotAction,
  ): void {
    const room = this.rooms.get(roomCode);
    const round = room?.round;
    const bot = room?.players.get(botUserId);
    if (!room || !round || !bot) return;
    if (room.phase !== 'playing' || round.resolved || round.roundNumber !== roundNumber) return;

    if (action.type === 'move') {
      this.applyPlayerMove(room, bot, action.move, roundNumber, false);
      return;
    }

    bot.board = undoMove(bot.board);
    bot.movesCompleted = bot.board.history.length;
    this.touch(room);
    this.persistProgress(room);
  }

  private applyPlayerMove(
    room: RoomRuntime,
    player: PlayerRuntime,
    move: MoveInput,
    roundNumber: number,
    notify: boolean,
  ): boolean {
    const round = room.round;
    if (!round || round.resolved || round.roundNumber !== roundNumber || room.phase !== 'playing') {
      return false;
    }

    try {
      const result = applyMove(
        player.board,
        round.target,
        move.cardAId,
        move.cardBId,
        move.operator,
      );
      player.board = result.nextState;
      player.movesCompleted = result.movesCompleted;
      this.touch(room);

      if (notify) {
        this.sendBoardUpdate(player, round.roundNumber);
        this.sendOpponentProgress(room, player);
      }

      if (result.isWin) {
        this.resolveWin(room, player, result.winningExpr);
      } else {
        this.persistProgress(room);
      }
      return true;
    } catch (error) {
      if (notify && error instanceof EngineError) {
        this.sendError(player, error.code, error.message);
        return false;
      }
      if (!(error instanceof EngineError)) {
        console.error('[rooms] unexpected move failure', error);
      }
      return false;
    }
  }

  private resolveWin(room: RoomRuntime, player: PlayerRuntime, winningExpr: string | null): void {
    const round = room.round;
    if (!round || round.resolved) return;

    round.resolved = true;
    this.clearRoundTimers(round);

    const preset = DIFFICULTIES[room.difficulty];
    const timestamp = this.now();
    const points = roundPoints(
      round.deadlineMs - timestamp,
      preset.roundDurationMs,
      preset.difficultyBonus,
    );

    player.score += points;
    player.roundWins += 1;
    player.totalSolveMs += Math.max(0, timestamp - round.startedAtMs);
    player.solveCount += 1;
    room.phase = 'round_over';
    this.touch(room);

    this.broadcastRoundOver(room, {
      winnerUserId: player.userId,
      winnerName: player.playerName,
      pointsAwarded: points,
      winningExpr,
    });
    this.persistProgress(room);
    this.scheduleTransition(room);
  }

  private handleRoundTimeout(roomCode: string, roundNumber: number): void {
    const room = this.rooms.get(roomCode);
    const round = room?.round;
    if (!room || !round || round.resolved || round.roundNumber !== roundNumber) return;

    round.resolved = true;
    this.clearRoundTimers(round);
    room.phase = 'round_over';
    this.touch(room);

    this.broadcastRoundOver(room, {
      winnerUserId: null,
      winnerName: null,
      pointsAwarded: 0,
      winningExpr: null,
    });
    this.persistProgress(room);
    this.scheduleTransition(room);
  }

  private scheduleTransition(room: RoomRuntime): void {
    if (room.transitionTimer) {
      clearTimeout(room.transitionTimer);
    }
    room.transitionTimer = setTimeout(() => {
      room.transitionTimer = null;
      if (room.phase !== 'round_over') return;
      if (room.currentRound >= room.totalRounds) {
        void this.finalizeMatch(room.code);
        return;
      }
      this.startRound(room, room.currentRound + 1);
    }, INTER_ROUND_PAUSE_MS);
  }

  private async finalizeMatch(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase === 'match_over') return;

    room.phase = 'match_over';
    if (room.round) {
      room.round.resolved = true;
      this.clearRoundTimers(room.round);
    }
    room.round = null;
    this.touch(room);

    const standingsBase = [...room.players.values()].map((player) => ({
      userId: player.userId,
      playerName: player.playerName,
      isBot: player.isBot,
      score: player.score,
      roundsWon: player.roundWins,
      avgSolveMs: player.solveCount > 0 ? Math.round(player.totalSolveMs / player.solveCount) : 0,
    }));

    standingsBase.sort(
      (left, right) => right.score - left.score || right.roundsWon - left.roundsWon,
    );

    const bestScore = standingsBase.reduce((best, standing) => Math.max(best, standing.score), 0);
    const leaders = standingsBase.filter((standing) => standing.score === bestScore);
    const winner = leaders.length === 1 ? leaders[0] : undefined;
    const winnerUserId = winner ? winner.userId : null;
    const matchId = this.matchIdFactory();

    let eloMap: Record<string, { eloBefore: number; eloAfter: number }> = {};
    if (this.repo) {
      try {
        eloMap = await this.repo.recordMatchElo({
          matchId,
          roomCode: room.code,
          winnerUserId,
          participants: standingsBase,
        });
      } catch (error) {
        console.error('[rooms] recordMatchElo failed', error);
      }
    }

    const standings: MatchStandingDTO[] = standingsBase.map((standing) => {
      const elo = eloMap[standing.userId];
      return {
        ...standing,
        eloBefore: elo?.eloBefore ?? STARTING_ELO,
        eloAfter: elo?.eloAfter ?? STARTING_ELO,
      };
    });

    const message: ServerMessage = {
      type: 'MATCH_OVER',
      matchId,
      winnerUserId,
      standings,
    };
    this.broadcast(room, message);
    this.persistProgress(room);

    if (this.repo) {
      const playedAt = new Date(this.now()).toISOString();
      const rows: MatchResultInsert[] = standings.map((standing) => ({
        match_id: matchId,
        room_code: room.code,
        user_id: standing.userId,
        player_name: standing.playerName,
        is_bot: standing.isBot,
        difficulty: room.difficulty,
        score: standing.score,
        rounds_won: standing.roundsWon,
        total_rounds: room.totalRounds,
        avg_solve_ms: standing.avgSolveMs,
        match_winner: winnerUserId === standing.userId,
        played_at: playedAt,
      }));

      try {
        await this.repo.insertMatchResults(rows);
      } catch (error) {
        console.error('[rooms] insertMatchResults failed', error);
      }
    }

    this.scheduleLiveProgressCleanup(room);
  }

  private scheduleLiveProgressCleanup(room: RoomRuntime): void {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }
    room.cleanupTimer = setTimeout(() => {
      room.cleanupTimer = null;
      if (this.repo) {
        void this.repo.deleteRoomLiveProgress(room.code);
      }
    }, LIVE_PROGRESS_CLEANUP_MS);
  }

  private expireGrace(roomCode: string, userId: string): void {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(userId);
    if (!room || !player || player.connected) return;
    this.leaveRoom(userId);
  }

  private destroyRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    this.clearRoomTimers(room);
    this.rooms.delete(roomCode);
    if (this.repo) {
      void this.repo.deleteRoomLiveProgress(roomCode);
    }
  }

  private clearRoundTimers(round: RoundRuntime): void {
    if (round.timer) {
      clearTimeout(round.timer);
      round.timer = null;
    }
    if (round.botRunner) {
      round.botRunner.stop();
      round.botRunner = null;
    }
  }

  private clearRoomTimers(room: RoomRuntime): void {
    if (room.transitionTimer) {
      clearTimeout(room.transitionTimer);
      room.transitionTimer = null;
    }
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    if (room.round) {
      this.clearRoundTimers(room.round);
    }
    for (const player of room.players.values()) {
      if (player.graceTimer) {
        clearTimeout(player.graceTimer);
        player.graceTimer = null;
      }
    }
  }

  private buildRoomState(room: RoomRuntime, player: PlayerRuntime): ServerMessage {
    const round = room.round;
    const players: RoomPlayerDTO[] = [...room.players.values()].map((contestant) => ({
      userId: contestant.userId,
      playerName: contestant.playerName,
      isBot: contestant.isBot,
      ready: contestant.ready,
      connected: contestant.connected,
      score: contestant.score,
      roundWins: contestant.roundWins,
      movesCompleted: contestant.movesCompleted,
    }));

    return {
      type: 'ROOM_STATE',
      roomCode: room.code,
      reconnectToken: player.reconnectToken,
      mode: room.mode,
      botTier: room.botTier,
      difficulty: room.difficulty,
      phase: room.phase,
      totalRounds: room.totalRounds,
      currentRound: room.currentRound,
      serverTimeMs: this.now(),
      deadlineMs: round && !round.resolved ? round.deadlineMs : null,
      target: round ? round.target : null,
      movesRequired: round ? round.movesRequired : 0,
      players,
      cards: player.board.cards,
      canUndo: player.board.history.length > 0,
      movesCompleted: player.movesCompleted,
    };
  }

  private sendRoomState(room: RoomRuntime, player: PlayerRuntime): void {
    this.sendTo(player.socket, this.buildRoomState(room, player));
  }

  private broadcastRoomState(room: RoomRuntime, exceptUserId?: string): void {
    for (const player of room.players.values()) {
      if (player.userId === exceptUserId) continue;
      this.sendRoomState(room, player);
    }
  }

  private broadcastRoundOver(room: RoomRuntime, outcome: RoundOutcome): void {
    const round = room.round;
    if (!round) return;

    const scores: Record<string, number> = {};
    const roundWins: Record<string, number> = {};
    for (const player of room.players.values()) {
      scores[player.userId] = player.score;
      roundWins[player.userId] = player.roundWins;
    }

    this.broadcast(room, {
      type: 'ROUND_OVER',
      roundNumber: round.roundNumber,
      winnerUserId: outcome.winnerUserId,
      winnerName: outcome.winnerName,
      pointsAwarded: outcome.pointsAwarded,
      winningExpr: outcome.winningExpr,
      optimalExpr: round.puzzle.optimalExpr,
      optimalSteps: round.puzzle.optimalSteps,
      scores,
      roundWins,
      nextRoundAtMs: this.now() + INTER_ROUND_PAUSE_MS,
    });
  }

  private sendBoardUpdate(player: PlayerRuntime, roundNumber: number): void {
    this.sendTo(player.socket, {
      type: 'BOARD_UPDATE',
      roundNumber,
      cards: player.board.cards,
      canUndo: player.board.history.length > 0,
      movesCompleted: player.movesCompleted,
    });
  }

  private sendOpponentProgress(room: RoomRuntime, mover: PlayerRuntime): void {
    const round = room.round;
    if (!round) return;

    for (const player of room.players.values()) {
      if (player.userId === mover.userId) continue;
      this.sendTo(player.socket, {
        type: 'OPPONENT_PROGRESS',
        userId: mover.userId,
        movesCompleted: mover.movesCompleted,
        movesRequired: round.movesRequired,
      });
    }
  }

  private broadcast(room: RoomRuntime, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const player of room.players.values()) {
      player.socket?.send(payload);
    }
  }

  private sendTo(socket: SocketSink | null, message: ServerMessage): void {
    socket?.send(JSON.stringify(message));
  }

  private sendError(player: PlayerRuntime, code: ErrorCode, message: string): void {
    this.sendErrorToSocket(player.socket, code, message);
  }

  private sendErrorToSocket(socket: SocketSink | null, code: ErrorCode, message: string): void {
    if (!socket) return;
    socket.send(JSON.stringify({ type: 'ERROR', code, message } satisfies ServerMessage));
  }

  private persistProgress(room: RoomRuntime): void {
    const repo = this.repo;
    if (!repo) return;

    const updatedAt = new Date(this.now()).toISOString();
    for (const player of room.players.values()) {
      const row: LiveProgressInsert = {
        id: liveProgressId(room.code, player.userId),
        room_code: room.code,
        user_id: player.userId,
        player_name: player.playerName,
        is_bot: player.isBot,
        round_number: room.currentRound,
        phase: room.phase,
        moves_completed: player.movesCompleted,
        moves_required: room.round?.movesRequired ?? 0,
        round_wins: player.roundWins,
        score: player.score,
        updated_at: updatedAt,
      };
      void repo.upsertLiveProgress(row).catch((error: unknown) => {
        console.error('[rooms] upsertLiveProgress failed', error);
      });
    }
  }
}
