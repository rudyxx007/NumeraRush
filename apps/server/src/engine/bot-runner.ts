import { BOT_PROFILES, type BotTier, type CardDTO, type Operator } from '@numera/shared';
import type { SolutionMove } from './puzzle-generator';

export interface BotMoveAction {
  type: 'move';
  move: { cardAId: string; cardBId: string; operator: Operator };
}

export interface BotUndoAction {
  type: 'undo';
}

export type BotAction = BotMoveAction | BotUndoAction;

export interface BotRunnerOptions {
  botTier: BotTier;
  plan: SolutionMove[];
  getAvailableCards: () => CardDTO[];
  onAction: (action: BotAction) => void;
  rand?: () => number;
}

export interface BotRunnerHandle {
  stop: () => void;
}

const DETOUR_PAUSE_MS = 1500;

/**
 * Drives a bot through its verified solution plan with human-like pacing.
 * Every timer is tracked so `stop()` leaves no pending work after a round ends.
 */
export function startBotRunner(options: BotRunnerOptions): BotRunnerHandle {
  const profile = BOT_PROFILES[options.botTier];
  const rand = options.rand ?? Math.random;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let index = 0;

  const delay = (): number =>
    profile.minDelayMs + Math.floor(rand() * (profile.maxDelayMs - profile.minDelayMs));

  const schedule = (fn: () => void, ms: number): void => {
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) fn();
    }, ms);
  };

  const performCurrentMove = (): void => {
    if (stopped) return;
    const move = options.plan[index];
    if (!move) return;

    options.onAction({
      type: 'move',
      move: { cardAId: move.cardAId, cardBId: move.cardBId, operator: move.operator },
    });
    index += 1;

    if (index < options.plan.length) {
      schedule(performCurrentMove, delay());
    }
  };

  const detourThenMove = (): void => {
    if (stopped) return;
    const cards = options.getAvailableCards();
    const isIntermediate = index < options.plan.length - 1;

    if (isIntermediate && cards.length >= 2 && rand() < profile.detourChance) {
      const first = cards[0];
      const second = cards[1];
      if (first && second) {
        options.onAction({
          type: 'move',
          move: { cardAId: first.id, cardBId: second.id, operator: '+' },
        });
        schedule(() => {
          options.onAction({ type: 'undo' });
          schedule(performCurrentMove, delay());
        }, DETOUR_PAUSE_MS);
        return;
      }
    }

    performCurrentMove();
  };

  schedule(detourThenMove, delay());

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
