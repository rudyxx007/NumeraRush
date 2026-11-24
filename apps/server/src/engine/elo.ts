import { BOT_ELO_CAP, ELO_K } from '@numera/shared';

export interface EloChange {
  eloBefore: number;
  eloAfter: number;
  delta: number;
}

export type MatchOutcome = 'a' | 'b' | 'draw';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Standard Elo expected score for player A. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function eloDelta(expected: number, actual: number, cap?: number): number {
  const raw = Math.round(ELO_K * (actual - expected));
  return cap === undefined ? raw : clamp(raw, -cap, cap);
}

export function applyElo(
  rating: number,
  expected: number,
  actual: number,
  cap?: number,
): EloChange {
  const delta = eloDelta(expected, actual, cap);
  return { eloBefore: rating, eloAfter: rating + delta, delta };
}

function actualScore(outcome: MatchOutcome): number {
  if (outcome === 'a') return 1;
  if (outcome === 'b') return 0;
  return 0.5;
}

/** Symmetric two-player Elo exchange. */
export function pvpElo(
  ratingA: number,
  ratingB: number,
  outcome: MatchOutcome,
): { a: EloChange; b: EloChange } {
  const expectedA = expectedScore(ratingA, ratingB);
  const actualA = actualScore(outcome);
  return {
    a: applyElo(ratingA, expectedA, actualA),
    b: applyElo(ratingB, 1 - expectedA, 1 - actualA),
  };
}

/**
 * Human vs fixed-rating bot: the human delta is clamped to [-16, +16]
 * and the bot rating never moves.
 */
export function botMatchElo(
  humanRating: number,
  botRating: number,
  outcome: MatchOutcome,
): { human: EloChange; bot: EloChange } {
  const expectedHuman = expectedScore(humanRating, botRating);
  const actualHuman = actualScore(outcome);
  return {
    human: applyElo(humanRating, expectedHuman, actualHuman, BOT_ELO_CAP),
    bot: { eloBefore: botRating, eloAfter: botRating, delta: 0 },
  };
}
