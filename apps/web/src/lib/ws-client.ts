import { type ClientMessage, type ServerMessage, ServerMessageSchema } from '@numera/shared';

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface ReconnectSession {
  roomCode: string;
  reconnectToken: string;
}

const SESSION_KEY = 'numera-rush:reconnect';
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5000;

export function readReconnectSession(storage?: Storage): ReconnectSession | null {
  const store = storage ?? sessionStorage;
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReconnectSession>;
    if (typeof parsed.roomCode === 'string' && typeof parsed.reconnectToken === 'string') {
      return { roomCode: parsed.roomCode, reconnectToken: parsed.reconnectToken };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveReconnectSession(session: ReconnectSession, storage?: Storage): void {
  const store = storage ?? sessionStorage;
  try {
    store.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in private browsing; reconnection is optional.
  }
}

export function clearReconnectSession(storage?: Storage): void {
  const store = storage ?? sessionStorage;
  try {
    store.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export interface WsClientOptions {
  url: string;
  getToken: () => Promise<string | null>;
  getPlayerName: () => string;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: WsStatus) => void;
  onError: (message: string) => void;
  storage?: Storage;
}

export class WsClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = true;
  private authenticating = false;

  constructor(private readonly options: WsClientOptions) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.options.onStatus('disconnected');
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private open(): void {
    if (this.stopped || this.socket) return;
    this.options.onStatus('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      this.options.onStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.addEventListener('open', () => {
      this.attempts = 0;
      this.options.onStatus('connected');
      void this.authenticate();
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const result = ServerMessageSchema.safeParse(parsed);
      if (!result.success) return;
      this.options.onMessage(result.data);
    });

    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null;
      this.options.onStatus('disconnected');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  private async authenticate(): Promise<void> {
    if (this.authenticating) return;
    this.authenticating = true;
    try {
      const token = await this.options.getToken();
      if (!token) {
        this.options.onError('Sign-in unavailable. Configure Supabase anonymous sign-ins.');
        return;
      }
      this.send({
        type: 'AUTH',
        token,
        playerName: this.options.getPlayerName(),
      });

      const session = readReconnectSession(this.options.storage);
      if (session) {
        this.send({
          type: 'RECONNECT_ROOM',
          roomCode: session.roomCode,
          reconnectToken: session.reconnectToken,
        });
      }
    } catch (error) {
      console.error('[ws] authentication failed', error);
      this.options.onError('Unable to sign in. Please retry.');
    } finally {
      this.authenticating = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** this.attempts);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }
}
