import { useQuery } from '@powersync/react';

export interface PlayerStatsRow {
  id: string;
  player_name: string;
  is_bot: number;
  elo_rating: number;
  matches_played: number;
  matches_won: number;
  fastest_solve_ms: number | null;
  updated_at: string;
}

export interface MatchResultRow {
  id: string;
  match_id: string;
  room_code: string;
  user_id: string;
  player_name: string;
  is_bot: number;
  difficulty: string;
  score: number;
  rounds_won: number;
  total_rounds: number;
  avg_solve_ms: number;
  match_winner: number;
  played_at: string;
}

export function useLeaderboard() {
  const rankings = useQuery<PlayerStatsRow>(
    'SELECT * FROM player_stats ORDER BY elo_rating DESC, matches_won DESC LIMIT 25',
  );
  const recentMatches = useQuery<MatchResultRow>(
    'SELECT * FROM match_results ORDER BY played_at DESC LIMIT 30',
  );

  return {
    rankings: rankings.data,
    recentMatches: recentMatches.data,
    isLoading: rankings.isLoading || recentMatches.isLoading,
  };
}
