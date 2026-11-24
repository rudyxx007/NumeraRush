import { normalizeRoomCode } from '@numera/shared';
import { useGameStore } from '../store/game-store';

const ROOM_PARAM = 'room';

interface ViewState {
  numeraView?: 'room' | 'lobby';
  roomCode?: string;
}

export function roomCodeFromUrl(): string | null {
  const raw = new URLSearchParams(window.location.search).get(ROOM_PARAM);
  const code = raw ? normalizeRoomCode(raw) : '';
  return code.length > 0 ? code : null;
}

function viewFromHistory(): 'room' | 'lobby' {
  return (window.history.state as ViewState | null)?.numeraView === 'room' ? 'room' : 'lobby';
}

/** Tag the current history entry as the lobby without adding a new entry. */
export function markLobbyView(): void {
  const state = (window.history.state ?? {}) as ViewState;
  if (state.numeraView === 'lobby') return;
  window.history.replaceState({ ...state, numeraView: 'lobby' }, '');
}

/** Push a room view so the browser Back button returns to the lobby. */
export function pushRoomView(roomCode: string): void {
  const url = new URL(window.location.href);
  const state = (window.history.state ?? {}) as ViewState;

  if (url.searchParams.get(ROOM_PARAM) === roomCode) {
    if (state.numeraView !== 'room') {
      window.history.replaceState({ ...state, numeraView: 'room', roomCode }, '');
    }
    return;
  }

  url.searchParams.set(ROOM_PARAM, roomCode);
  window.history.pushState({ numeraView: 'room', roomCode } satisfies ViewState, '', url);
}

/** Rewrite the current entry into the lobby view, dropping the room parameter. */
export function replaceLobbyView(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(ROOM_PARAM)) {
    markLobbyView();
    return;
  }

  url.searchParams.delete(ROOM_PARAM);
  const query = url.searchParams.toString();
  const next = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  window.history.replaceState({ numeraView: 'lobby' } satisfies ViewState, '', next);
}

/**
 * Leave the current room. When the room view was pushed onto history we rewind
 * it, so the app and the browser's Back button stay in sync instead of adding
 * a duplicate lobby entry on every exit.
 */
export function exitRoom(): void {
  if (viewFromHistory() === 'room' && window.history.length > 1) {
    window.history.back();
    return;
  }
  useGameStore.getState().leaveRoom();
}
