import { useQuery } from '@powersync/react';

export interface LiveProgressRow {
  id: string;
  room_code: string;
  user_id: string;
  player_name: string;
  is_bot: number;
  round_number: number;
  phase: string;
  moves_completed: number;
  moves_required: number;
  round_wins: number;
  score: number;
  updated_at: string;
}

const ROOM_QUERY =
  'SELECT * FROM live_progress WHERE room_code = ? ORDER BY score DESC, moves_completed DESC';
const EMPTY_QUERY = 'SELECT * FROM live_progress WHERE 0';

/**
 * Live race telemetry is read exclusively from the embedded PowerSync SQLite
 * replica — never from REST and never mirrored into Zustand.
 */
export function useLiveRace(roomCode: string | null) {
  const { data, isLoading, error } = useQuery<LiveProgressRow>(
    roomCode ? ROOM_QUERY : EMPTY_QUERY,
    roomCode ? [roomCode] : [],
  );

  return {
    rows: roomCode ? data : [],
    isLoading: Boolean(roomCode) && isLoading,
    error,
  };
}
