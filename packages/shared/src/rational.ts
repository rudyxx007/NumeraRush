import type { CardDTO, Operator } from './protocol';

/** Exact rational number: `num / den`, always normalized with `den > 0`. */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

export function absBigInt(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/** Euclidean greatest common divisor. Always returns a non-negative value. */
export function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

/** Normalize a fraction: sign on the numerator, reduced, zero is `0/1`. */
export function normalize(num: bigint, den: bigint): Rational {
  if (den === 0n) {
    throw new Error('DIV_BY_ZERO');
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  let normalizedNum = num;
  let normalizedDen = den;
  if (normalizedDen < 0n) {
    normalizedNum = -normalizedNum;
    normalizedDen = -normalizedDen;
  }
  const divisor = gcdBigInt(normalizedNum, normalizedDen);
  return { num: normalizedNum / divisor, den: normalizedDen / divisor };
}

export function fromInt(n: number): Rational {
  if (!Number.isInteger(n)) {
    throw new Error('INVALID_INTEGER');
  }
  return { num: BigInt(n), den: 1n };
}

export function fromStrings(num: string, den: string): Rational {
  return normalize(BigInt(num), BigInt(den));
}

export function add(a: Rational, b: Rational): Rational {
  return normalize(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return normalize(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return normalize(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  return normalize(a.num * b.den, a.den * b.num);
}

export function applyOp(a: Rational, b: Rational, operator: Operator): Rational {
  switch (operator) {
    case '+':
      return add(a, b);
    case '-':
      return sub(a, b);
    case '*':
      return mul(a, b);
    case '/':
      return div(a, b);
    default:
      throw new Error(`UNKNOWN_OPERATOR:${String(operator)}`);
  }
}

export function equals(a: Rational, b: Rational): boolean {
  return a.num * b.den === b.num * a.den;
}

export function equalsInt(a: Rational, target: number): boolean {
  return a.den === 1n && a.num === BigInt(target);
}

export function formatRational(r: Rational): string {
  return r.den === 1n ? r.num.toString() : `${r.num}/${r.den}`;
}

export function toRationalDTO(r: Rational): { num: string; den: string; display: string } {
  return { num: r.num.toString(), den: r.den.toString(), display: formatRational(r) };
}

export function toCardDTO(id: string, r: Rational, expr: string): CardDTO {
  return { id, num: r.num.toString(), den: r.den.toString(), display: formatRational(r), expr };
}
