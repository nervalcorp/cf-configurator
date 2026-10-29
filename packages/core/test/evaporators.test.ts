import { describe, expect, it } from 'vitest';
import {
  EVAPORATORS,
  addEvaporator,
  buildCompartment,
  checkEvaporator,
  defaultCompartment,
  evaporatorCoverage,
  evaporatorThrow,
  framesFor,
  inToMm,
  normalizeCompartment,
  setShape,
  suggestEvaporators,
  updateEvaporator,
  validateCompartment,
  type Compartment,
} from '../src';

const ft = (n: number) => inToMm(n * 12);

describe('evaporator catalog', () => {
  it('has six cooler and five freezer models, 1-2 fans for coolers and 1-3 for freezers', () => {
    const c = EVAPORATORS.filter((e) => e.line === 'cooler');
    const f = EVAPORATORS.filter((e) => e.line === 'freezer');
    expect(c).toHaveLength(6);
    expect(f).toHaveLength(5);
    expect([...new Set(c.map((e) => e.fans))].sort()).toEqual([1, 2]);
    expect([...new Set(f.map((e) => e.fans))].sort()).toEqual([1, 2, 3]);
  });
});

describe('placing evaporators', () => {
  it('puts one unit on the wall facing the door in a 12.5\' room, blowing toward the door', () => {
    const { compartment: c, id } = addEvaporator(defaultCompartment());
    const e = c.evaporators.find((x) => x.id === id)!;
    const back = framesFor(c).find((f) => f.letter === 'C')!; // wall opposite the front wall
    expect(e.wall).toBe(back.edge);
    expect(checkEvaporator(c, e).errors).toEqual([]);
    expect(evaporatorThrow(c, e)).toBeLessThan(ft(13));
    expect(evaporatorCoverage(c)).toBeGreaterThan(0.85);
  });

  it('never suggests a spot over a door', () => {
    const r = suggestEvaporators(defaultCompartment());
    const front = framesFor(r.compartment).find((f) => f.letter === 'A')!;
    expect(r.compartment.evaporators.some((e) => e.wall === front.edge && checkEvaporator(r.compartment, e).errors.some((m) => /door/.test(m)))).toBe(false);
  });

  it('suggests one unit for a small room', () => {
    expect(suggestEvaporators(defaultCompartment()).count).toBe(1);
  });

  it('suggests a second unit when the room is too long for one throw', () => {
    const long: Compartment = { ...defaultCompartment(), boxW: ft(12), boxD: ft(30) };
    const r = suggestEvaporators(long);
    expect(r.count).toBe(2); // 20'-40' long: two units
    expect(r.coverage).toBeGreaterThan(0.9);
    expect(r.compartment.evaporators.every((e) => !checkEvaporator(r.compartment, e).errors.length)).toBe(true);
  });

  it('suggests two units for a room over 20\' long', () => {
    const wide: Compartment = { ...defaultCompartment(), boxW: ft(28), boxD: ft(12) };
    const r = suggestEvaporators(wide);
    expect(r.count).toBeGreaterThanOrEqual(2);
    expect(r.coverage).toBeGreaterThan(0.9);
  });

  it('covers the leg of an L-shaped room', () => {
    const l = setShape({ ...defaultCompartment(), boxW: ft(24), boxD: ft(24) }, 'cutout-h', 0.45, 0.45);
    const r = suggestEvaporators(normalizeCompartment(l));
    expect(r.count).toBeGreaterThanOrEqual(2);
    expect(r.coverage).toBeGreaterThan(0.85);
  });
});

describe('evaporator rules', () => {
  it('flags a unit over a door', () => {
    let { compartment: c, id } = addEvaporator(defaultCompartment());
    const front = framesFor(c).find((f) => f.letter === 'A')!;
    c = updateEvaporator(c, id!, { wall: front.edge, offset: c.doors[0].offset + inToMm(17) });
    expect(checkEvaporator(c, c.evaporators[0]).errors.some((m) => /over a door/.test(m))).toBe(true);
    expect(validateCompartment(c).some((i) => i.tab === 'refrigeration' && i.severity === 'error')).toBe(true);
  });

  it('flags too little room behind the coil', () => {
    let { compartment: c, id } = addEvaporator(defaultCompartment());
    c = updateEvaporator(c, id!, { gap: inToMm(4) });
    expect(checkEvaporator(c, c.evaporators[0]).errors.some((m) => /behind it/.test(m))).toBe(true);
  });

  it('flags a throw past 25\'', () => {
    // Add never picks such a spot, so put a unit on the back wall of a 32' room by hand.
    const long: Compartment = { ...defaultCompartment(), boxW: ft(12), boxD: ft(32) };
    const back = framesFor(long).find((f) => f.letter === 'C')!;
    const c = { ...long, evaporators: [{ id: 'ev1', model: 'ICC-EVC1500', wall: back.edge, offset: back.length / 2, gap: inToMm(20) }] };
    expect(validateCompartment(c).some((i) => /throw/.test(i.message) && i.severity === 'error')).toBe(true);
  });

  it('swaps to the matching freezer model when the room turns freezer', () => {
    const { compartment: c } = addEvaporator(defaultCompartment(), 'ICC-EVC1500');
    const f = normalizeCompartment({ ...c, temperature: 'freezer' });
    expect(f.evaporators[0].model).toBe('ICC-EVF1500');
  });

  it('builds a housing, one fan per fan, and a throw zone', () => {
    const { compartment: c } = addEvaporator(defaultCompartment(), 'ICC-EVC2000');
    const t = buildCompartment(c, 'indoor');
    const ev = t.parts.filter((p) => p.id.includes(':evap-'));
    expect(ev.filter((p) => p.kind === 'fan' && p.id.includes('fan-'))).toHaveLength(2);
    expect(ev.some((p) => p.kind === 'evap-throw')).toBe(true);
  });

  it('warns when there is no evaporator', () => {
    expect(validateCompartment(defaultCompartment()).some((i) => /no evaporator/.test(i.message))).toBe(true);
  });
});
