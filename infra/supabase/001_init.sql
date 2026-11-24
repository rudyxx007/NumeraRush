-- NumeraRush — Supabase schema (Section 5.1)
-- Every synced table uses a text primary key (required by PowerSync).
-- Clients are strictly read-only; apps/server writes via the service role key.

-- 1. Live Race Progress (one row per player per active room)
CREATE TABLE IF NOT EXISTS public.live_progress (
  id TEXT PRIMARY KEY, -- deterministic composite key: "${room_code}:${user_id}"
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  round_number INTEGER NOT NULL DEFAULT 1,
  phase TEXT NOT NULL CHECK (phase IN ('waiting', 'playing', 'round_over', 'match_over')),
  moves_completed INTEGER NOT NULL DEFAULT 0,
  moves_required INTEGER NOT NULL DEFAULT 0,
  round_wins INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_progress_room ON public.live_progress(room_code);

-- 2. Match Results (one row per player per completed match)
CREATE TABLE IF NOT EXISTS public.match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'scott_wu')),
  score INTEGER NOT NULL,
  rounds_won INTEGER NOT NULL,
  total_rounds INTEGER NOT NULL,
  avg_solve_ms INTEGER NOT NULL DEFAULT 0,
  match_winner BOOLEAN NOT NULL DEFAULT FALSE,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_results_played_at ON public.match_results(played_at DESC);

-- 3. Persistent Player Elo & Career Stats
CREATE TABLE IF NOT EXISTS public.player_stats (
  id TEXT PRIMARY KEY, -- Supabase auth.uid() or 'bot:rookie' | 'bot:tactician' | 'bot:grandmaster'
  player_name TEXT NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  elo_rating INTEGER NOT NULL DEFAULT 1200,
  matches_played INTEGER NOT NULL DEFAULT 0,
  matches_won INTEGER NOT NULL DEFAULT 0,
  fastest_solve_ms INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Row Level Security: Clients are strictly READ-ONLY
ALTER TABLE public.live_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_live_progress" ON public.live_progress
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "authenticated_read_match_results" ON public.match_results
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "authenticated_read_player_stats" ON public.player_stats
  FOR SELECT TO authenticated USING (TRUE);

-- 5. PowerSync Logical Replication Publication (MANDATORY)
DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE
  public.live_progress,
  public.match_results,
  public.player_stats;
