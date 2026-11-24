import { type Difficulty, type ServerMessage, fromInt, toCardDTO } from '@numera/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EloSnapshot,
  ISupabaseRepo,
  LiveProgressInsert,
  MatchResultInsert,
  RecordMatchEloParams,
} from '../db/supabase-repo';
import type { GeneratedPuzzle, SolutionMove } from '../engine/puzzle-generator';
import { RoomManager } from './room-manager';
import type { SocketSink } from './types';

class FakeSocket implements SocketSink {
  readonly messages: ServerMessage[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data) as ServerMessage);
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const message = this.messages[index];
      if (message?.type === type) {
        return message as Extract<ServerMessage, { type: T }>;
      }
    }
    return undefined;
  }

  count(type: ServerMessage['type']): number {
    return this.messages.filter((message) => message.type === type).length;
  }
}

class MockRepo implements ISupabaseRepo {
  readonly progress = new Map<string, LiveProgressInsert>();
  readonly results: MatchResultInsert[] = [];
  readonly deletedRooms: string[] = [];
  eloCalls = 0;

  async verifyUserToken(jwt: string): Promise<{ userId: string } | null> {
    return jwt.startsWith('user:') ? { userId: jwt.slice(5) } : null;
  }

  async upsertLiveProgress(row: LiveProgressInsert): Promise<void> {
    this.progress.set(row.id, row);
  }

  async deleteRoomLiveProgress(roomCode: string): Promise<void> {
    this.deletedRooms.push(roomCode);
  }

  async insertMatchResults(rows: MatchResultInsert[]): Promise<void> {
    this.results.push(...rows);
  }

  async recordMatchElo(params: RecordMatchEloParams): Promise<Record<string, EloSnapshot>> {
    this.eloCalls += 1;
    const snapshots: Record<string, EloSnapshot> = {};
    for (const participant of params.participants) {
      const eloBefore = participant.isBot ? 1000 : 1200;
      const eloAfter = params.winnerUserId === participant.userId ? eloBefore + 16 : eloBefore - 16;
      snapshots[participant.userId] = { eloBefore, eloAfter };
    }
    return snapshots;
  }
}

/** 6 * 4 = 24, 24 * 3 = 72, 72 / 2 = 36. */
function makePuzzle(): GeneratedPuzzle {
  const values = [6, 4, 3, 2];
  const cards = values.map((value, index) =>
    toCardDTO(`c_${index}`, fromInt(value), String(value)),
  );
  const botMovePlan: SolutionMove[] = [
    {
      cardAId: 'c_0',
      cardBId: 'c_1',
      operator: '*',
      resultCardId: 'm_1',
      displayStep: '6 * 4 = 24',
    },
    {
      cardAId: 'm_1',
      cardBId: 'c_2',
      operator: '*',
      resultCardId: 'm_2',
      displayStep: '24 * 3 = 72',
    },
    {
      cardAId: 'm_2',
      cardBId: 'c_3',
      operator: '/',
      resultCardId: 'm_3',
      displayStep: '72 / 2 = 36',
    },
  ];
  return {
    difficulty: 'easy' satisfies Difficulty,
    cards,
    target: 36,
    optimalExpr: '(((6 * 4) * 3) / 2)',
    optimalSteps: botMovePlan.map((move) => move.displayStep),
    botMovePlan,
  };
}

function makeManager(repo: MockRepo, roomCode = 'abc123'): RoomManager {
  return new RoomManager({
    repo,
    puzzleFactory: makePuzzle,
    random: () => 0.5,
    roomCodeFactory: () => roomCode,
  });
}

function solveRound(manager: RoomManager, userId: string, roundNumber = 1): void {
  manager.handleMove(userId, {
    type: 'MAKE_MOVE',
    roundNumber,
    cardAId: 'c_0',
    cardBId: 'c_1',
    operator: '*',
  });
  manager.handleMove(userId, {
    type: 'MAKE_MOVE',
    roundNumber,
    cardAId: 'm_1',
    cardBId: 'c_2',
    operator: '*',
  });
  manager.handleMove(userId, {
    type: 'MAKE_MOVE',
    roundNumber,
    cardAId: 'm_2',
    cardBId: 'c_3',
    operator: '/',
  });
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('RoomManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs a complete PvP match with authoritative scoring and Elo persistence', async () => {
    const repo = new MockRepo();
    const manager = makeManager(repo);
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    const room = manager.createRoom(
      { userId: 'u1', playerName: 'Host', socket: hostSocket },
      { difficulty: 'easy', totalRounds: 1, mode: 'pvp' },
    );

    expect(room.code).toBe('ABC123');
    expect(room.phase).toBe('waiting');
    const waitingState = hostSocket.last('ROOM_STATE');
    expect(waitingState?.roomCode).toBe('ABC123');
    expect(waitingState?.reconnectToken.length).toBeGreaterThan(0);

    expect(
      manager.joinRoom('abc123', { userId: 'u2', playerName: 'Guest', socket: guestSocket }),
    ).toBe(room);

    manager.setReady('u1', true);
    manager.setReady('u2', true);

    const playingState = hostSocket.last('ROOM_STATE');
    expect(playingState?.phase).toBe('playing');
    expect(playingState?.cards).toHaveLength(4);
    expect(playingState?.movesRequired).toBe(3);
    expect(guestSocket.last('ROOM_STATE')?.target).toBe(36);

    solveRound(manager, 'u1');

    expect(hostSocket.last('BOARD_UPDATE')?.movesCompleted).toBe(3);
    const roundOver = hostSocket.last('ROUND_OVER');
    expect(roundOver).toBeDefined();
    expect(roundOver?.winnerUserId).toBe('u1');
    expect(roundOver?.winnerName).toBe('Host');
    expect(roundOver?.pointsAwarded).toBe(2000);
    expect(roundOver?.winningExpr).toBe('(((6 * 4) * 3) / 2)');
    expect(roundOver?.optimalSteps).toEqual(['6 * 4 = 24', '24 * 3 = 72', '72 / 2 = 36']);
    expect(roundOver?.scores.u1).toBe(2000);
    expect(roundOver?.scores.u2).toBe(0);
    expect(roundOver?.roundWins.u1).toBe(1);
    expect(guestSocket.last('ROUND_OVER')?.winnerUserId).toBe('u1');

    await flushMicrotasks();
    expect(repo.progress.get('ABC123:u1')?.score).toBe(2000);
    expect(repo.progress.get('ABC123:u1')?.moves_completed).toBe(3);

    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    const matchOver = hostSocket.last('MATCH_OVER');
    expect(matchOver).toBeDefined();
    expect(matchOver?.winnerUserId).toBe('u1');
    expect(matchOver?.standings).toHaveLength(2);
    expect(matchOver?.standings[0]?.userId).toBe('u1');
    expect(matchOver?.standings[0]?.eloBefore).toBe(1200);
    expect(matchOver?.standings[0]?.eloAfter).toBe(1216);
    expect(matchOver?.standings[1]?.eloAfter).toBe(1184);

    expect(repo.eloCalls).toBe(1);
    expect(repo.results).toHaveLength(2);
    expect(repo.results[0]?.match_winner).toBe(true);
    expect(repo.results[1]?.match_winner).toBe(false);
    expect(repo.progress.get('ABC123:u1')?.phase).toBe('match_over');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(repo.deletedRooms).toContain('ABC123');
  });

  it('sends ROUND_OVER exactly once when both players win on the same tick', async () => {
    const repo = new MockRepo();
    const manager = makeManager(repo);
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    manager.createRoom(
      { userId: 'u1', playerName: 'Host', socket: hostSocket },
      { difficulty: 'easy', totalRounds: 1, mode: 'pvp' },
    );
    manager.joinRoom('ABC123', { userId: 'u2', playerName: 'Guest', socket: guestSocket });
    manager.setReady('u1', true);
    manager.setReady('u2', true);

    manager.handleMove('u1', {
      type: 'MAKE_MOVE',
      roundNumber: 1,
      cardAId: 'c_0',
      cardBId: 'c_1',
      operator: '*',
    });
    manager.handleMove('u2', {
      type: 'MAKE_MOVE',
      roundNumber: 1,
      cardAId: 'c_0',
      cardBId: 'c_1',
      operator: '*',
    });
    manager.handleMove('u1', {
      type: 'MAKE_MOVE',
      roundNumber: 1,
      cardAId: 'm_1',
      cardBId: 'c_2',
      operator: '*',
    });
    manager.handleMove('u2', {
      type: 'MAKE_MOVE',
      roundNumber: 1,
      cardAId: 'm_1',
      cardBId: 'c_2',
      operator: '*',
    });

    manager.handleMove('u1', {
      type: 'MAKE_MOVE',
      roundNumber: 1,
      cardAId: 'm_2',
      cardBId: 'c_3',
      operator: '/',
    });
    manager.handleMove('u2', {
      type: 'MAKE_MOVE',
      roundNumber: 1,
      cardAId: 'm_2',
      cardBId: 'c_3',
      operator: '/',
    });

    expect(hostSocket.count('ROUND_OVER')).toBe(1);
    expect(guestSocket.count('ROUND_OVER')).toBe(1);

    const roundOver = hostSocket.last('ROUND_OVER');
    expect(roundOver?.winnerUserId).toBe('u1');
    expect(roundOver?.scores.u2).toBe(0);

    const staleError = guestSocket.messages.find(
      (message) => message.type === 'ERROR' && message.code === 'STALE_ROUND',
    );
    expect(staleError).toBeDefined();
    expect(guestSocket.last('ROUND_OVER')?.scores.u1).toBe(2000);

    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();
    expect(repo.results).toHaveLength(2);
  });

  it('restores the exact mid-round board after a disconnect and reconnect', async () => {
    const repo = new MockRepo();
    const manager = makeManager(repo);
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    manager.createRoom(
      { userId: 'u1', playerName: 'Host', socket: hostSocket },
      { difficulty: 'easy', totalRounds: 1, mode: 'pvp' },
    );
    manager.joinRoom('ABC123', { userId: 'u2', playerName: 'Guest', socket: guestSocket });
    manager.setReady('u1', true);
    manager.setReady('u2', true);

    const reconnectToken = hostSocket.last('ROOM_STATE')?.reconnectToken;
    expect(reconnectToken).toBeTruthy();

    manager.handleMove('u1', {
      type: 'MAKE_MOVE',
      roundNumber: 1,
      cardAId: 'c_0',
      cardBId: 'c_1',
      operator: '*',
    });

    manager.handleDisconnect('u1');
    expect(guestSocket.last('ROOM_STATE')?.players.find((p) => p.userId === 'u1')?.connected).toBe(
      false,
    );

    const restoredSocket = new FakeSocket();
    const reconnected = manager.reconnect('abc123', reconnectToken ?? '', restoredSocket);
    expect(reconnected).toEqual({ userId: 'u1', roomCode: 'ABC123' });

    const restoredState = restoredSocket.last('ROOM_STATE');
    expect(restoredState?.phase).toBe('playing');
    expect(restoredState?.cards.map((card) => card.id)).toEqual(['c_2', 'c_3', 'm_1']);
    expect(restoredState?.movesCompleted).toBe(1);
    expect(restoredState?.canUndo).toBe(true);

    manager.handleUndo('u1', { type: 'UNDO_MOVE', roundNumber: 1 });
    expect(restoredSocket.last('BOARD_UPDATE')?.cards).toHaveLength(4);
  });

  it('forfeits a player whose 30s reconnect window expires', async () => {
    const repo = new MockRepo();
    const manager = makeManager(repo);
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    manager.createRoom(
      { userId: 'u1', playerName: 'Host', socket: hostSocket },
      { difficulty: 'easy', totalRounds: 3, mode: 'pvp' },
    );
    manager.joinRoom('ABC123', { userId: 'u2', playerName: 'Guest', socket: guestSocket });
    manager.setReady('u1', true);
    manager.setReady('u2', true);

    manager.handleDisconnect('u1');
    await vi.advanceTimersByTimeAsync(30_000);
    await flushMicrotasks();

    const matchOver = guestSocket.last('MATCH_OVER');
    expect(matchOver?.winnerUserId).toBe('u2');
    expect(repo.results).toHaveLength(1);
    expect(repo.results[0]?.user_id).toBe('u2');
  });

  it('runs a bot match end-to-end and the idle human loses', async () => {
    const repo = new MockRepo();
    const manager = makeManager(repo, 'bot123');
    const hostSocket = new FakeSocket();

    const room = manager.createRoom(
      { userId: 'u1', playerName: 'Host', socket: hostSocket },
      { difficulty: 'easy', totalRounds: 1, mode: 'bot', botTier: 'rookie' },
    );

    expect(room.phase).toBe('playing');
    expect(room.players.size).toBe(2);
    expect(room.botTier).toBe('rookie');
    expect(hostSocket.last('ROOM_STATE')?.players.find((p) => p.isBot)?.playerName).toBe(
      'Rookie Bot',
    );

    await flushMicrotasks();
    expect(repo.progress.get('BOT123:bot:rookie')).toBeDefined();

    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();
    expect(repo.progress.get('BOT123:bot:rookie')?.moves_completed).toBe(1);

    await vi.advanceTimersByTimeAsync(90_000);
    await flushMicrotasks();

    expect(hostSocket.count('ROUND_OVER')).toBe(1);
    expect(hostSocket.last('ROUND_OVER')?.winnerUserId).toBe('bot:rookie');

    const matchOver = hostSocket.last('MATCH_OVER');
    expect(matchOver?.winnerUserId).toBe('bot:rookie');
    expect(matchOver?.standings.find((s) => s.userId === 'u1')?.score).toBe(0);
    expect(repo.eloCalls).toBe(1);
    expect(repo.progress.get('BOT123:u1')?.phase).toBe('match_over');
  });

  it('rejects a move from a stale round without corrupting state', () => {
    const repo = new MockRepo();
    const manager = makeManager(repo);
    const hostSocket = new FakeSocket();
    const guestSocket = new FakeSocket();

    manager.createRoom(
      { userId: 'u1', playerName: 'Host', socket: hostSocket },
      { difficulty: 'easy', totalRounds: 1, mode: 'pvp' },
    );
    manager.joinRoom('ABC123', { userId: 'u2', playerName: 'Guest', socket: guestSocket });
    manager.setReady('u1', true);
    manager.setReady('u2', true);

    manager.handleMove('u2', {
      type: 'MAKE_MOVE',
      roundNumber: 99,
      cardAId: 'c_0',
      cardBId: 'c_1',
      operator: '*',
    });

    const error = guestSocket.messages.find((message) => message.type === 'ERROR');
    expect(error?.code).toBe('STALE_ROUND');
    expect(guestSocket.last('BOARD_UPDATE')).toBeUndefined();
    expect(guestSocket.last('ROOM_STATE')?.movesCompleted).toBe(0);
  });
});
