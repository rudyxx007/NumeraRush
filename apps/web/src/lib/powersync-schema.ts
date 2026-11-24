import { Schema, Table, column } from '@powersync/web';

const live_progress = new Table(
  {
    room_code: column.text,
    user_id: column.text,
    player_name: column.text,
    is_bot: column.integer,
    round_number: column.integer,
    phase: column.text,
    moves_completed: column.integer,
    moves_required: column.integer,
    round_wins: column.integer,
    score: column.integer,
    updated_at: column.text,
  },
  { indexes: { room: ['room_code'] } },
);

const match_results = new Table({
  match_id: column.text,
  room_code: column.text,
  user_id: column.text,
  player_name: column.text,
  is_bot: column.integer,
  difficulty: column.text,
  score: column.integer,
  rounds_won: column.integer,
  total_rounds: column.integer,
  avg_solve_ms: column.integer,
  match_winner: column.integer,
  played_at: column.text,
});

const player_stats = new Table({
  player_name: column.text,
  is_bot: column.integer,
  elo_rating: column.integer,
  matches_played: column.integer,
  matches_won: column.integer,
  fastest_solve_ms: column.integer,
  updated_at: column.text,
});

export const AppSchema = new Schema({
  live_progress,
  match_results,
  player_stats,
});
