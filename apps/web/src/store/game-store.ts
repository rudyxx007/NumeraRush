import {
  type BotTier,
  type Difficulty,
  type MatchOverMessage,
  type Operator,
  ROOM_CODE_LENGTH,
  type RoomStateMessage,
  type RoundCount,
  type RoundOverMessage,
  type ServerMessage,
  normalizeRoomCode,
} from '@numera/shared';
import { create } from 'zustand';
import { ensureAccessToken } from '../lib/supabase';
import {
  WsClient,
  type WsStatus,
  clearReconnectSession,
  saveReconnectSession,
} from '../lib/ws-client';
import { useFxStore } from './fx-store';

const PLAYER_NAME_KEY = 'numera-rush:player-name';
const DEFAULT_PLAYER_NAME = 'Player';
const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:4000/ws';

let client: WsClient | null = null;

function readPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY)?.trim() || DEFAULT_PLAYER_NAME;
  } catch {
    return DEFAULT_PLAYER_NAME;
  }
}

function persistPlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // localStorage can be unavailable; the name still lives in memory.
  }
}

export interface CreateRoomForm {
  difficulty: Difficulty;
  totalRounds: RoundCount;
  mode: 'pvp' | 'bot';
  botTier?: BotTier;
}

interface GameStore {
  playerName: string;
  userId: string | null;
  wsStatus: WsStatus;
  room: RoomStateMessage | null;
  deadlineLocalMs: number | null;
  selectedCardId: string | null;
  selectedOperator: Operator | null;
  roundSummary: RoundOverMessage | null;
  matchOver: MatchOverMessage | null;
  error: { code: string; message: string } | null;
  leaderboardOpen: boolean;

  connect: () => void;
  setPlayerName: (name: string) => void;
  toggleLeaderboard: (open?: boolean) => void;
  selectCard: (cardId: string) => void;
  selectOperator: (operator: Operator) => void;
  clearSelection: () => void;
  dismissError: () => void;
  dismissRoundSummary: () => void;
  dismissMatchOver: () => void;
  createRoom: (form: CreateRoomForm) => void;
  joinRoom: (roomCode: string) => void;
  setReady: (ready: boolean) => void;
  undo: () => void;
  reset: () => void;
  rematch: () => void;
  leaveRoom: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  const disconnectNotice = (message: string): void =>
    set({ error: { code: 'UNAUTHORIZED', message } });

  const handleMessage = (message: ServerMessage): void => {
    switch (message.type) {
      case 'AUTH_OK':
        set({ userId: message.userId });
        break;

      case 'ROOM_STATE': {
        saveReconnectSession({
          roomCode: message.roomCode,
          reconnectToken: message.reconnectToken,
        });
        set((state) => ({
          room: message,
          deadlineLocalMs:
            message.deadlineMs === null
              ? null
              : Date.now() + (message.deadlineMs - message.serverTimeMs),
          selectedCardId:
            state.selectedCardId && message.cards.some((card) => card.id === state.selectedCardId)
              ? state.selectedCardId
              : null,
          selectedOperator: null,
          error: null,
          ...(message.phase === 'waiting' || message.phase === 'playing'
            ? { roundSummary: null, matchOver: null }
            : {}),
        }));
        break;
      }

      case 'BOARD_UPDATE': {
        const previous = get().room;
        const merged = previous !== null && message.cards.length < previous.cards.length;
        set((state) =>
          state.room
            ? {
                room: {
                  ...state.room,
                  cards: message.cards,
                  canUndo: message.canUndo,
                  movesCompleted: message.movesCompleted,
                },
              }
            : {},
        );
        if (merged) useFxStore.getState().triggerPulse('merge');
        break;
      }

      case 'OPPONENT_PROGRESS':
        set((state) =>
          state.room
            ? {
                room: {
                  ...state.room,
                  players: state.room.players.map((player) =>
                    player.userId === message.userId
                      ? { ...player, movesCompleted: message.movesCompleted }
                      : player,
                  ),
                },
              }
            : {},
        );
        break;

      case 'ROUND_OVER':
        if (message.winnerUserId !== null) {
          useFxStore.getState().triggerPulse('solve');
        }
        set((state) => ({
          roundSummary: message,
          deadlineLocalMs: null,
          selectedCardId: null,
          selectedOperator: null,
          room: state.room
            ? {
                ...state.room,
                phase: 'round_over',
                deadlineMs: null,
                players: state.room.players.map((player) => ({
                  ...player,
                  score: message.scores[player.userId] ?? player.score,
                  roundWins: message.roundWins[player.userId] ?? player.roundWins,
                })),
              }
            : null,
        }));
        break;

      case 'MATCH_OVER':
        set((state) => ({
          matchOver: message,
          roundSummary: null,
          selectedCardId: null,
          selectedOperator: null,
          deadlineLocalMs: null,
          room: state.room ? { ...state.room, phase: 'match_over', deadlineMs: null } : null,
        }));
        break;

      case 'ERROR': {
        const abandoned = message.code === 'ROOM_NOT_FOUND' || message.code === 'UNAUTHORIZED';
        if (abandoned) {
          clearReconnectSession();
          set({
            room: null,
            roundSummary: null,
            matchOver: null,
            deadlineLocalMs: null,
            selectedCardId: null,
            selectedOperator: null,
          });
        }
        set({ error: { code: message.code, message: message.message } });
        break;
      }
    }
  };

  return {
    playerName: readPlayerName(),
    userId: null,
    wsStatus: 'idle',
    room: null,
    deadlineLocalMs: null,
    selectedCardId: null,
    selectedOperator: null,
    roundSummary: null,
    matchOver: null,
    error: null,
    leaderboardOpen: false,

    connect: () => {
      if (client) {
        client.connect();
        return;
      }
      client = new WsClient({
        url: WS_URL,
        getToken: ensureAccessToken,
        getPlayerName: () => get().playerName,
        onMessage: handleMessage,
        onStatus: (wsStatus) => set({ wsStatus }),
        onError: (message) => disconnectNotice(message),
      });
      client.connect();
    },

    setPlayerName: (name) => {
      const cleaned = name.trim().slice(0, 24) || DEFAULT_PLAYER_NAME;
      persistPlayerName(cleaned);
      set({ playerName: cleaned });
      client?.send({ type: 'SET_NAME', playerName: cleaned });
    },

    toggleLeaderboard: (open) => {
      set((state) => ({ leaderboardOpen: open ?? !state.leaderboardOpen }));
    },

    selectCard: (cardId) => {
      const { room, selectedCardId, selectedOperator } = get();
      if (!room || room.phase !== 'playing') return;

      if (selectedCardId === null) {
        set({ selectedCardId: cardId });
        return;
      }

      if (selectedCardId === cardId) {
        set({ selectedCardId: null, selectedOperator: null });
        return;
      }

      if (selectedOperator === null) {
        set({ selectedCardId: cardId });
        return;
      }

      const sent = client?.send({
        type: 'MAKE_MOVE',
        roundNumber: room.currentRound,
        cardAId: selectedCardId,
        cardBId: cardId,
        operator: selectedOperator,
      });
      set({ selectedCardId: null, selectedOperator: null });

      if (!sent) {
        disconnectNotice('Connection lost — your move was not sent. Reconnecting…');
      }
    },

    selectOperator: (operator) => {
      if (!get().selectedCardId) return;
      set((state) => ({
        selectedOperator: state.selectedOperator === operator ? null : operator,
      }));
    },

    clearSelection: () => set({ selectedCardId: null, selectedOperator: null }),

    dismissError: () => set({ error: null }),
    dismissRoundSummary: () => set({ roundSummary: null }),
    dismissMatchOver: () => set({ matchOver: null }),

    createRoom: (form) => {
      const sent = client?.send({
        type: 'CREATE_ROOM',
        difficulty: form.difficulty,
        totalRounds: form.totalRounds,
        mode: form.mode,
        botTier: form.mode === 'bot' ? (form.botTier ?? 'rookie') : undefined,
      });
      if (!sent) {
        disconnectNotice('Not connected to the game server yet. Retrying…');
        client?.connect();
      }
    },

    joinRoom: (roomCode) => {
      const code = normalizeRoomCode(roomCode);
      if (code.length !== ROOM_CODE_LENGTH) {
        set({
          error: { code: 'ROOM_NOT_FOUND', message: 'Room codes are exactly 6 characters' },
        });
        return;
      }
      const sent = client?.send({ type: 'JOIN_ROOM', roomCode: code });
      if (!sent) {
        disconnectNotice('Not connected to the game server yet. Retrying…');
        client?.connect();
      }
    },

    setReady: (ready) => {
      client?.send({ type: 'SET_READY', ready });
    },

    undo: () => {
      const room = get().room;
      if (!room || room.phase !== 'playing') return;
      client?.send({ type: 'UNDO_MOVE', roundNumber: room.currentRound });
      set({ selectedCardId: null, selectedOperator: null });
    },

    reset: () => {
      const room = get().room;
      if (!room || room.phase !== 'playing') return;
      client?.send({ type: 'RESET_BOARD', roundNumber: room.currentRound });
      set({ selectedCardId: null, selectedOperator: null });
    },

    rematch: () => {
      client?.send({ type: 'REMATCH' });
      set({ matchOver: null });
    },

    leaveRoom: () => {
      client?.send({ type: 'LEAVE_ROOM' });
      clearReconnectSession();
      set({
        room: null,
        deadlineLocalMs: null,
        roundSummary: null,
        matchOver: null,
        selectedCardId: null,
        selectedOperator: null,
      });
    },
  };
});
