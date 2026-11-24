import { describe, expect, it } from 'vitest';
import {
  absBigInt,
  add,
  applyOp,
  div,
  equals,
  equalsInt,
  formatRational,
  fromInt,
  fromStrings,
  gcdBigInt,
  mul,
  normalize,
  sub,
  toCardDTO,
} from './rational';

describe('Rational arithmetic', () => {
  it('computes the classic floating-point trap 8 / (3 - 8/3) === 24 exactly', () => {
    const result = div(fromInt(8), sub(fromInt(3), div(fromInt(8), fromInt(3))));

    expect(result).toEqual({ num: 24n, den: 1n });
    expect(equalsInt(result, 24)).toBe(true);
    expect(formatRational(result)).toBe('24');
  });

  it('normalizes negative denominators onto the numerator', () => {
    expect(normalize(4n, -6n)).toEqual({ num: -2n, den: 3n });
    expect(normalize(-4n, -6n)).toEqual({ num: 2n, den: 3n });
  });

  it('normalizes a zero numerator to 0/1', () => {
    expect(normalize(0n, 99n)).toEqual({ num: 0n, den: 1n });
    expect(normalize(0n, -99n)).toEqual({ num: 0n, den: 1n });
  });

  it('throws DIV_BY_ZERO for a zero denominator', () => {
    expect(() => normalize(1n, 0n)).toThrow('DIV_BY_ZERO');
    expect(() => div(fromInt(5), fromInt(0))).toThrow('DIV_BY_ZERO');
  });

  it('is non-commutative for subtraction and division', () => {
    const ten = fromInt(10);
    const three = fromInt(3);

    expect(formatRational(sub(ten, three))).toBe('7');
    expect(formatRational(sub(three, ten))).toBe('-7');
    expect(formatRational(div(ten, three))).toBe('10/3');
    expect(formatRational(div(three, ten))).toBe('3/10');
    expect(equals(sub(ten, three), sub(three, ten))).toBe(false);
  });

  it('applies every operator through applyOp', () => {
    const a = fromInt(9);
    const b = fromStrings('3', '2');

    expect(applyOp(a, b, '+')).toEqual(normalize(21n, 2n));
    expect(applyOp(a, b, '-')).toEqual(normalize(15n, 2n));
    expect(applyOp(a, b, '*')).toEqual(normalize(27n, 2n));
    expect(applyOp(a, b, '/')).toEqual(normalize(6n, 1n));
  });

  it('supports gcd helpers and mixed arithmetic', () => {
    expect(gcdBigInt(-48n, 18n)).toBe(6n);
    expect(absBigInt(-7n)).toBe(7n);
    expect(add(fromStrings('1', '3'), fromStrings('1', '6'))).toEqual(normalize(1n, 2n));
    expect(mul(fromStrings('2', '3'), fromStrings('3', '2'))).toEqual(normalize(1n, 1n));
  });

  it('serializes cards with decimal string fields', () => {
    expect(toCardDTO('c_0', fromStrings('8', '3'), '(12 - 4)')).toEqual({
      id: 'c_0',
      num: '8',
      den: '3',
      display: '8/3',
      expr: '(12 - 4)',
    });
  });
});
