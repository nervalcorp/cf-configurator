import { describe, expect, it } from 'vitest';
import { formatFeetInches, formatInches, inToMm, mmToIn, snapToStep } from '../src';

describe('units', () => {
  it('round-trips inches through mm', () => {
    expect(mmToIn(inToMm(150))).toBeCloseTo(150, 10);
  });
  it('formats feet and inches without a 12" remainder', () => {
    expect(formatFeetInches(inToMm(100))).toBe(`8' 4"`);
    expect(formatFeetInches(inToMm(119.6))).toBe(`10' 0"`);
    expect(formatFeetInches(inToMm(90))).toBe(`7' 6"`);
  });
  it('formats whole inches', () => {
    expect(formatInches(inToMm(34))).toBe('34"');
  });
  it('snaps to a 6" grid', () => {
    expect(mmToIn(snapToStep(inToMm(152), 6))).toBe(150);
    expect(mmToIn(snapToStep(inToMm(154), 6))).toBe(156);
  });
});
