import {
  type CardDTO,
  DIFFICULTIES,
  type Difficulty,
  type DifficultyPreset,
  type Operator,
  type Rational,
  absBigInt,
  applyOp,
  formatRational,
  fromInt,
  toCardDTO,
} from '@numera/shared';

export interface SolutionMove {
  cardAId: string;
  cardBId: string;
  operator: Operator;
  resultCardId: string;
  /** e.g. "12 - 4 = 8". */
  displayStep: string;
}

export interface GeneratedPuzzle {
  difficulty: Difficulty;
  cards: CardDTO[];
  target: number;
  optimalExpr: string;
  /** Human-readable lines for RoundSummaryModal. */
  optimalSteps: string[];
  /** Exact executable IDs for bot-runner.ts. */
  botMovePlan: SolutionMove[];
}

const OPERATORS: readonly Operator[] = ['+', '-', '*', '/'];
const MAX_ATTEMPTS = 500;
const MAX_NUMERATOR = 50_000n;
const MAX_DENOMINATOR = 12n;

interface WorkingNode {
  id: string;
  value: Rational;
  expr: string;
}

interface Candidate {
  a: WorkingNode;
  b: WorkingNode;
  operator: Operator;
  result: Rational;
}

function randomInt(min: number, max: number, rand: () => number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Draw `cardCount` integers, allowing at most two occurrences of any value. */
function drawValues(preset: DifficultyPreset, rand: () => number): number[] {
  const values: number[] = [];
  const occurrences = new Map<number, number>();
  let guard = 0;

  while (values.length < preset.cardCount && guard < 5_000) {
    guard += 1;
    const value = randomInt(preset.cardMin, preset.cardMax, rand);
    const seen = occurrences.get(value) ?? 0;
    if (seen >= 2) continue;
    occurrences.set(value, seen + 1);
    values.push(value);
  }

  while (values.length < preset.cardCount) {
    values.push(randomInt(preset.cardMin, preset.cardMax, rand));
  }

  return values;
}

function describeStep(a: Rational, b: Rational, operator: Operator, result: Rational): string {
  return `${formatRational(a)} ${operator} ${formatRational(b)} = ${formatRational(result)}`;
}

/**
 * Constructive generation: merge a random card set down to a single card while
 * rejecting illegal/oversized intermediate values. The final merge must land on
 * an exact integer inside the preset's target window, which guarantees the
 * puzzle is solvable and that `botMovePlan` is already a verified solution trace.
 */
function attemptConstruct(
  difficulty: Difficulty,
  preset: DifficultyPreset,
  rand: () => number,
): GeneratedPuzzle | null {
  const values = drawValues(preset, rand);
  let nodes: WorkingNode[] = values.map((value, index) => ({
    id: `c_${index}`,
    value: fromInt(value),
    expr: String(value),
  }));

  const plan: SolutionMove[] = [];
  const intermediateCap = Math.max(preset.targetMax * 3, preset.cardMax * 6);
  let mergeSeq = 1;

  for (let step = 0; step < preset.cardCount - 1; step += 1) {
    const isFinal = step === preset.cardCount - 2;
    const candidates: Candidate[] = [];

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = 0; j < nodes.length; j += 1) {
        if (i === j) continue;
        const a = nodes[i];
        const b = nodes[j];
        if (!a || !b) continue;

        for (const operator of OPERATORS) {
          let result: Rational;
          try {
            result = applyOp(a.value, b.value, operator);
          } catch {
            continue;
          }

          if (result.den > MAX_DENOMINATOR) continue;
          if (absBigInt(result.num) > MAX_NUMERATOR) continue;
          if (result.num < 0n) continue;

          if (isFinal) {
            if (result.den !== 1n) continue;
            const targetValue = Number(result.num);
            if (targetValue < preset.targetMin || targetValue > preset.targetMax) continue;
          } else if (Number(result.num) > intermediateCap) {
            continue;
          }

          candidates.push({ a, b, operator, result });
        }
      }
    }

    if (candidates.length === 0) return null;

    let pool = candidates;
    if (!isFinal && rand() < 0.65) {
      const spicy = candidates.filter(
        (candidate) => candidate.operator === '*' || candidate.operator === '/',
      );
      if (spicy.length > 0) pool = spicy;
    }

    const chosen = pool[Math.floor(rand() * pool.length)];
    if (!chosen) return null;

    const mergedCard = toCardDTO(
      `m_${mergeSeq}`,
      chosen.result,
      `(${chosen.a.expr} ${chosen.operator} ${chosen.b.expr})`,
    );

    plan.push({
      cardAId: chosen.a.id,
      cardBId: chosen.b.id,
      operator: chosen.operator,
      resultCardId: mergedCard.id,
      displayStep: describeStep(chosen.a.value, chosen.b.value, chosen.operator, chosen.result),
    });

    nodes = nodes.filter((node) => node.id !== chosen.a.id && node.id !== chosen.b.id);
    nodes.push({ id: mergedCard.id, value: chosen.result, expr: mergedCard.expr });
    mergeSeq += 1;
  }

  const finalNode = nodes[0];
  if (!finalNode || finalNode.value.den !== 1n) return null;

  const target = Number(finalNode.value.num);
  if (target < preset.targetMin || target > preset.targetMax) return null;

  const cards = values.map((value, index) =>
    toCardDTO(`c_${index}`, fromInt(value), String(value)),
  );

  return {
    difficulty,
    cards,
    target,
    optimalExpr: finalNode.expr,
    optimalSteps: plan.map((move) => move.displayStep),
    botMovePlan: plan,
  };
}

interface FallbackSpec {
  values: number[];
  moves: Array<{ a: string; b: string; operator: Operator }>;
}

/**
 * Verified deterministic fallbacks (one per tier) so `generatePuzzle()` can
 * never throw or loop forever, even under an adversarial `rand`.
 */
const FALLBACKS: Record<Difficulty, FallbackSpec> = {
  easy: {
    values: [6, 4, 3, 2],
    moves: [
      { a: 'c_0', b: 'c_1', operator: '*' },
      { a: 'm_1', b: 'c_2', operator: '*' },
      { a: 'm_2', b: 'c_3', operator: '/' },
    ],
  },
  medium: {
    values: [9, 5, 2, 3, 4],
    moves: [
      { a: 'c_0', b: 'c_1', operator: '*' },
      { a: 'm_1', b: 'c_2', operator: '*' },
      { a: 'm_2', b: 'c_3', operator: '+' },
      { a: 'm_3', b: 'c_4', operator: '+' },
    ],
  },
  hard: {
    values: [12, 5, 3, 2, 10, 4],
    moves: [
      { a: 'c_0', b: 'c_1', operator: '*' },
      { a: 'm_1', b: 'c_2', operator: '*' },
      { a: 'm_2', b: 'c_3', operator: '/' },
      { a: 'm_3', b: 'c_4', operator: '*' },
      { a: 'm_4', b: 'c_5', operator: '+' },
    ],
  },
  scott_wu: {
    values: [25, 4, 3, 2, 10, 5, 6],
    moves: [
      { a: 'c_0', b: 'c_1', operator: '*' },
      { a: 'm_1', b: 'c_2', operator: '*' },
      { a: 'm_2', b: 'c_3', operator: '*' },
      { a: 'm_3', b: 'c_4', operator: '*' },
      { a: 'm_4', b: 'c_5', operator: '/' },
      { a: 'm_5', b: 'c_6', operator: '+' },
    ],
  },
};

function buildFromSpec(difficulty: Difficulty, spec: FallbackSpec): GeneratedPuzzle {
  const preset = DIFFICULTIES[difficulty];
  const cards = spec.values.map((value, index) =>
    toCardDTO(`c_${index}`, fromInt(value), String(value)),
  );
  let nodes: WorkingNode[] = spec.values.map((value, index) => ({
    id: `c_${index}`,
    value: fromInt(value),
    expr: String(value),
  }));
  const plan: SolutionMove[] = [];

  spec.moves.forEach((move, index) => {
    const a = nodes.find((node) => node.id === move.a);
    const b = nodes.find((node) => node.id === move.b);
    if (!a || !b) throw new Error('Invalid fallback puzzle');

    const result = applyOp(a.value, b.value, move.operator);
    const mergedCard = toCardDTO(
      `m_${index + 1}`,
      result,
      `(${a.expr} ${move.operator} ${b.expr})`,
    );
    plan.push({
      cardAId: a.id,
      cardBId: b.id,
      operator: move.operator,
      resultCardId: mergedCard.id,
      displayStep: describeStep(a.value, b.value, move.operator, result),
    });
    nodes = nodes.filter((node) => node.id !== a.id && node.id !== b.id);
    nodes.push({ id: mergedCard.id, value: result, expr: mergedCard.expr });
  });

  const finalNode = nodes[0];
  if (!finalNode || finalNode.value.den !== 1n) throw new Error('Invalid fallback target');
  const target = Number(finalNode.value.num);
  if (target < preset.targetMin || target > preset.targetMax) {
    throw new Error('Fallback target out of range');
  }
  if (cards.length !== preset.cardCount) throw new Error('Fallback card count mismatch');

  return {
    difficulty,
    cards,
    target,
    optimalExpr: finalNode.expr,
    optimalSteps: plan.map((move) => move.displayStep),
    botMovePlan: plan,
  };
}

export function generateFallbackPuzzle(difficulty: Difficulty): GeneratedPuzzle {
  return buildFromSpec(difficulty, FALLBACKS[difficulty]);
}

export function generatePuzzle(
  difficulty: Difficulty,
  rand: () => number = Math.random,
): GeneratedPuzzle {
  const preset = DIFFICULTIES[difficulty];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const puzzle = attemptConstruct(difficulty, preset, rand);
    if (puzzle) return puzzle;
  }

  return generateFallbackPuzzle(difficulty);
}
