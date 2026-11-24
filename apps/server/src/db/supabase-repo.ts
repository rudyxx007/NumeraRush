import { BOT_PROFILES, type BotTier, type Difficulty, STARTING_ELO } from '@numera/shared';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { botMatchElo, pvpElo } from '../engine/elo';
import { isSupabaseConfigured } from '../env';

export interface LiveProgressInsert {
  id: string;
  room_code: string;
  user_id: string;
  player_name: string;
  is_bot: boolean;
  round_number: number;
  phase: string;
  moves_completed: number;
  moves_required: number;
  round_wins: number;
  score: number;
  updated_at: string;
}

export interface MatchResultInsert {
  match_id: string;
  room_code: string;
  user_id: string;
  player_name: string;
  is_bot: boolean;
  difficulty: Difficulty;
  score: number;
  rounds_won: number;
  total_rounds: number;
  avg_solve_ms: number;
  match_winner: boolean;
  played_at: string;
}

export interface EloParticipant {
  userId: string;
  playerName: string;
  isBot: boolean;
  score: number;
  roundsWon: number;
  avgSolveMs: number;
}

export interface RecordMatchEloParams {
  matchId: string;
  roomCode: string;
  winnerUserId: string | null;
  participants: EloParticipant[];
}

export interface EloSnapshot {
  eloBefore: number;
  eloAfter: number;
}

export interface ISupabaseRepo {
  verifyUserToken(jwt: string): Promise<{ userId: string } | null>;
  upsertLiveProgress(row: LiveProgressInsert): Promise<void>;
  deleteRoomLiveProgress(roomCode: string): Promise<void>;
  insertMatchResults(rows: MatchResultInsert[]): Promise<void>;
  recordMatchElo(params: RecordMatchEloParams): Promise<Record<string, EloSnapshot>>;
}

interface PlayerStatsRow {
  id: string;
  player_name: string | null;
  is_bot: boolean | null;
  elo_rating: number | null;
  matches_played: number | null;
  matches_won: number | null;
  fastest_solve_ms: number | null;
}

function botEloFromUserId(userId: string): number {
  const tier = userId.startsWith('bot:') ? (userId.slice(4) as BotTier) : null;
  if (tier && tier in BOT_PROFILES) {
    return BOT_PROFILES[tier].elo;
  }
  return STARTING_ELO;
}

/**
 * All DB access is best-effort: a transient Supabase failure is logged but must
 * never crash an in-memory match.
 */
export class SupabaseRepo implements ISupabaseRepo {
  private readonly client: SupabaseClient | null;
  private readonly devMode: boolean;

  constructor(config: { url?: string; serviceRoleKey?: string }) {
    this.devMode = !isSupabaseConfigured;
    if (this.devMode) {
      console.warn(
        '[supabase] Supabase not configured — running in dev mode (auth bypassed, DB writes are no-ops).',
      );
      this.client = null;
      return;
    }
    this.client = createClient(config.url as string, config.serviceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async verifyUserToken(jwt: string): Promise<{ userId: string } | null> {
    if (this.devMode) {
      // Dev mode: accept "dev:<userId>" tokens or use the token itself as userId.
      if (jwt.startsWith('dev:')) {
        const userId = jwt.slice(4).trim();
        return userId ? { userId } : null;
      }
      // Accept any non-empty token as a dev userId.
      if (jwt.trim().length > 0) {
        return { userId: jwt.trim() };
      }
      return null;
    }
    try {
      const { data, error } = await (this.client as SupabaseClient).auth.getUser(jwt);
      if (error || !data.user) {
        return null;
      }
      return { userId: data.user.id };
    } catch (error) {
      console.error('[supabase] verifyUserToken failed', error);
      return null;
    }
  }

  async upsertLiveProgress(row: LiveProgressInsert): Promise<void> {
    if (this.devMode) return;
    try {
      const { error } = await (this.client as SupabaseClient)
        .from('live_progress')
        .upsert(row, { onConflict: 'id' });
      if (error) {
        console.error('[supabase] upsertLiveProgress rejected', error.message);
      }
    } catch (error) {
      console.error('[supabase] upsertLiveProgress threw', error);
    }
  }

  async deleteRoomLiveProgress(roomCode: string): Promise<void> {
    if (this.devMode) return;
    try {
      const { error } = await (this.client as SupabaseClient)
        .from('live_progress')
        .delete()
        .eq('room_code', roomCode);
      if (error) {
        console.error('[supabase] deleteRoomLiveProgress rejected', error.message);
      }
    } catch (error) {
      console.error('[supabase] deleteRoomLiveProgress threw', error);
    }
  }

  async insertMatchResults(rows: MatchResultInsert[]): Promise<void> {
    if (this.devMode) return;
    if (rows.length === 0) return;
    try {
      const { error } = await (this.client as SupabaseClient).from('match_results').insert(rows);
      if (error) {
        console.error('[supabase] insertMatchResults rejected', error.message);
      }
    } catch (error) {
      console.error('[supabase] insertMatchResults threw', error);
    }
  }

  async recordMatchElo(params: RecordMatchEloParams): Promise<Record<string, EloSnapshot>> {
    if (this.devMode) {
      // In dev mode, return starting Elo for everyone (no persistence).
      const result: Record<string, EloSnapshot> = {};
      for (const participant of params.participants) {
        result[participant.userId] = { eloBefore: STARTING_ELO, eloAfter: STARTING_ELO };
      }
      return result;
    }
    const fallback: Record<string, EloSnapshot> = {};
    for (const participant of params.participants) {
      fallback[participant.userId] = { eloBefore: STARTING_ELO, eloAfter: STARTING_ELO };
    }

    try {
      const ids = params.participants.map((participant) => participant.userId);
      const { data, error } = await (this.client as SupabaseClient)
        .from('player_stats')
        .select(
          'id, player_name, is_bot, elo_rating, matches_played, matches_won, fastest_solve_ms',
        )
        .in('id', ids);

      if (error) {
        console.error('[supabase] recordMatchElo read rejected', error.message);
      }

      const existingRows = new Map<string, PlayerStatsRow>();
      for (const row of (data ?? []) as PlayerStatsRow[]) {
        existingRows.set(row.id, row);
      }

      const before = new Map<string, number>();
      for (const participant of params.participants) {
        const existing = existingRows.get(participant.userId);
        before.set(
          participant.userId,
          existing?.elo_rating ??
            (participant.isBot ? botEloFromUserId(participant.userId) : STARTING_ELO),
        );
      }

      const after = new Map<string, number>();
      for (const participant of params.participants) {
        after.set(participant.userId, before.get(participant.userId) ?? STARTING_ELO);
      }

      const humans = params.participants.filter((participant) => !participant.isBot);
      const bots = params.participants.filter((participant) => participant.isBot);

      if (humans.length === 1 && bots.length === 1) {
        const human = humans[0];
        const bot = bots[0];
        if (human && bot) {
          const outcome =
            params.winnerUserId === null
              ? 'draw'
              : params.winnerUserId === human.userId
                ? 'a'
                : 'b';
          const result = botMatchElo(
            before.get(human.userId) ?? STARTING_ELO,
            before.get(bot.userId) ?? STARTING_ELO,
            outcome,
          );
          after.set(human.userId, result.human.eloAfter);
          after.set(bot.userId, result.bot.eloAfter);
        }
      } else if (humans.length === 2) {
        const [playerA, playerB] = humans;
        if (playerA && playerB) {
          const outcome =
            params.winnerUserId === null
              ? 'draw'
              : params.winnerUserId === playerA.userId
                ? 'a'
                : 'b';
          const result = pvpElo(
            before.get(playerA.userId) ?? STARTING_ELO,
            before.get(playerB.userId) ?? STARTING_ELO,
            outcome,
          );
          after.set(playerA.userId, result.a.eloAfter);
          after.set(playerB.userId, result.b.eloAfter);
        }
      }

      const snapshots: Record<string, EloSnapshot> = {};

      for (const participant of params.participants) {
        const eloBefore = before.get(participant.userId) ?? STARTING_ELO;
        const eloAfter = after.get(participant.userId) ?? eloBefore;
        snapshots[participant.userId] = { eloBefore, eloAfter };

        const existing = existingRows.get(participant.userId);
        const previousFastest = existing?.fastest_solve_ms ?? null;
        const fastestSolveMs = participant.isBot
          ? previousFastest
          : participant.avgSolveMs > 0
            ? Math.min(previousFastest ?? Number.MAX_SAFE_INTEGER, participant.avgSolveMs)
            : previousFastest;

        const row = {
          id: participant.userId,
          player_name: participant.playerName,
          is_bot: participant.isBot,
          elo_rating: participant.isBot ? eloBefore : eloAfter,
          matches_played: (existing?.matches_played ?? 0) + 1,
          matches_won:
            (existing?.matches_won ?? 0) + (params.winnerUserId === participant.userId ? 1 : 0),
          fastest_solve_ms: fastestSolveMs === Number.MAX_SAFE_INTEGER ? null : fastestSolveMs,
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await (this.client as SupabaseClient)
          .from('player_stats')
          .upsert(row, { onConflict: 'id' });
        if (upsertError) {
          console.error('[supabase] player_stats upsert rejected', upsertError.message);
        }
      }

      return snapshots;
    } catch (error) {
      console.error('[supabase] recordMatchElo threw', error);
      return fallback;
    }
  }
}
