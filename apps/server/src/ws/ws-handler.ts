import { ClientMessageSchema, type ErrorCode, type ServerMessage } from '@numera/shared';
import type { FastifyInstance } from 'fastify';
import type { ISupabaseRepo } from '../db/supabase-repo';
import type { RoomManager } from '../rooms/room-manager';
import type { SocketSink } from '../rooms/types';

interface ConnectionState {
  userId: string | null;
  playerName: string;
  roomCode: string | null;
}

export interface WsHandlerDeps {
  repo: ISupabaseRepo;
  rooms: RoomManager;
}

/**
 * Authenticated WebSocket route. Messages are handled strictly in order: auth
 * resolves before any queued gameplay message is processed, and gameplay
 * messages are rejected until AUTH succeeds.
 */
export function registerWsHandler(app: FastifyInstance, deps: WsHandlerDeps): void {
  app.get('/ws', { websocket: true }, (socket) => {
    const state: ConnectionState = { userId: null, playerName: '', roomCode: null };

    const sink: SocketSink = {
      send: (data: string) => {
        // 1 === WebSocket.OPEN
        if (socket.readyState === 1) socket.send(data);
      },
    };

    const send = (message: ServerMessage): void => sink.send(JSON.stringify(message));
    const fail = (code: ErrorCode, message: string): void => send({ type: 'ERROR', code, message });

    const handleMessage = async (raw: unknown): Promise<void> => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        fail('BAD_PAYLOAD', 'Messages must be JSON encoded');
        return;
      }

      const result = ClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        fail('BAD_PAYLOAD', 'Unrecognised or malformed message payload');
        return;
      }

      const message = result.data;

      if (message.type === 'AUTH') {
        const user = await deps.repo.verifyUserToken(message.token);
        if (!user) {
          fail('UNAUTHORIZED', 'Invalid or expired session token');
          return;
        }
        state.userId = user.userId;
        state.playerName = message.playerName;
        send({ type: 'AUTH_OK', userId: user.userId, playerName: message.playerName });
        return;
      }

      const userId = state.userId;
      if (!userId) {
        fail('UNAUTHORIZED', 'Authenticate before sending gameplay messages');
        return;
      }

      switch (message.type) {
        case 'CREATE_ROOM': {
          const room = deps.rooms.createRoom(
            { userId, playerName: state.playerName, socket: sink },
            {
              difficulty: message.difficulty,
              totalRounds: message.totalRounds,
              mode: message.mode,
              botTier: message.botTier,
            },
          );
          state.roomCode = room.code;
          break;
        }
        case 'JOIN_ROOM': {
          const room = deps.rooms.joinRoom(message.roomCode, {
            userId,
            playerName: state.playerName,
            socket: sink,
          });
          if (room) state.roomCode = room.code;
          break;
        }
        case 'RECONNECT_ROOM': {
          const reconnected = deps.rooms.reconnect(message.roomCode, message.reconnectToken, sink);
          if (reconnected) {
            state.userId = reconnected.userId;
            state.roomCode = reconnected.roomCode;
          }
          break;
        }
        case 'SET_READY':
          deps.rooms.setReady(userId, message.ready);
          break;
        case 'SET_NAME':
          state.playerName = message.playerName;
          deps.rooms.updatePlayerName(userId, message.playerName);
          break;
        case 'MAKE_MOVE':
          if (!state.roomCode) {
            fail('ROOM_NOT_FOUND', 'Join a room before making moves');
            break;
          }
          deps.rooms.handleMove(userId, message);
          break;
        case 'UNDO_MOVE':
          deps.rooms.handleUndo(userId, message);
          break;
        case 'RESET_BOARD':
          deps.rooms.handleReset(userId, message);
          break;
        case 'REMATCH':
          deps.rooms.rematch(userId);
          break;
        case 'LEAVE_ROOM':
          deps.rooms.leaveRoom(userId);
          state.roomCode = null;
          break;
        default:
          break;
      }
    };

    let queue: Promise<void> = Promise.resolve();

    socket.on('message', (raw: unknown) => {
      queue = queue
        .then(() => handleMessage(raw))
        .catch((error: unknown) => {
          console.error('[ws] message handler failed', error);
        });
    });

    socket.on('close', () => {
      if (state.userId) {
        deps.rooms.handleDisconnect(state.userId);
      }
    });
  });
}
