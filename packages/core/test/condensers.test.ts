import { describe, expect, it } from 'vitest';
import {
  CONDENSERS,
  addCondenser,
  addEvaporator,
  buildCompartment,
  checkCondenser,
  condenserOptions,
  defaultCompartment,
  getCondenser,
  inToMm,
  matchAllEvaporators,
  normalizeCompartment,
  suggestEvaporators,
  unservedEvaporators,
  updateCondenser,
  validateCompartment,
  type Compartment,
  type ModelPart,
  checkEvaporator,
  getEvaporator,
  packagedCabinet,
  setSystem,
  framesFor,
} from '../src';

const ft = (n: number) => inToMm(n * 12);
const withEvap = (model = 'ICC-EVC1500'): Compartment => addEvaporator(defaultCompartment(), model).compartment;

describe('condensing unit catalog', () => {
  it('has the ICC lineup: 6 SUIC, 7 SUOC, 3 SUIF, 5 SUOF, and 9 packaged', () => {
    const count = (p: string) => CONDENSERS.filter((d) => d.sku.startsWith(p)).length;
    expect([count('ICC-SUIC'), count('ICC-SUOC'), count('ICC-SUIF'), count('ICC-SUOF')]).toEqual([6, 7, 3, 5]);

  });
});

describe('pairing', () => {
  it('adds an indoor unit on the roof for an indoor site, sized to the evaporator', () => {
    const r = addCondenser(withEvap(), 'indoor');
    const u = r.compartment.condensers[0];
    expect(getCondenser(u.model).type).toBe('indoor');
    expect(u.serves).toEqual(['ev1']);
    // ICC's matched pair: same model number
    expect(u.model).toBe('ICC-SUIC1500');
    expect(checkCondenser(r.compartment, u, 'indoor').errors).toEqual([]);
  });

  it('puts an outdoor unit outside the walk-in, clear of the wall', () => {
    const r = addCondenser(withEvap('ICC-EVC1000'), 'outdoor');
    const u = r.compartment.condensers[0];
    expect(getCondenser(u.model).type).toBe('outdoor');
    expect(checkCondenser(r.compartment, u, 'outdoor').errors).toEqual([]);
  });

  it('marks ICC matched pairs among the options', () => {
    const opts = condenserOptions(withEvap('ICC-EVC1000'), ['ev1']);
    expect(opts.filter((o) => o.matched).map((o) => o.def.sku).sort()).toEqual(['ICC-SUIC1000', 'ICC-SUOC1000']);
  });

  it('disables models that are too small or for the other temperature, with a reason', () => {
    const c = withEvap('ICC-EVC4000'); // 41,037 BTU/h
    const opts = condenserOptions(c, ['ev1']);
    expect(opts.find((o) => o.def.sku === 'ICC-SUIC500')!.blocker).toMatch(/Too small/);
    expect(opts.every((o) => o.def.line === 'cooler')).toBe(true);
  });

  it('lets an indoor cooler unit serve up to 3 evaporators and a freezer unit only 1', () => {
    let c: Compartment = { ...defaultCompartment(), boxW: ft(40), boxD: ft(12) };
    c = suggestEvaporators(c).compartment;
    c = { ...c, evaporators: [...c.evaporators, { ...c.evaporators[0], id: 'ev9', offset: c.evaporators[0].offset + 2000 }].slice(0, 3) };
    const opts = condenserOptions(c, c.evaporators.map((e) => e.id));
    const outdoor = opts.filter((o) => o.def.type === 'outdoor');
    if (c.evaporators.length === 3) expect(outdoor.every((o) => /at most 2/.test(o.blocker ?? ''))).toBe(true);
    const fz = normalizeCompartment({ ...c, temperature: 'freezer' });
    const fopts = condenserOptions(fz, fz.evaporators.slice(0, 2).map((e) => e.id));
    expect(fopts.every((o) => /at most 1/.test(o.blocker ?? ''))).toBe(true);
  });

  it('matches every evaporator with as few units as the rules allow', () => {
    let c: Compartment = { ...defaultCompartment(), boxW: ft(30), boxD: ft(28), temperature: 'freezer' };
    c = suggestEvaporators(normalizeCompartment(c)).compartment;
    const m = matchAllEvaporators(c, 'indoor');
    expect(unservedEvaporators(m)).toEqual([]);
    expect(m.condensers.length).toBe(c.evaporators.length); // freezers: 1:1
  });

  it('flags an undersized unit and an evaporator without a condensing unit', () => {
    let c = withEvap('ICC-EVC4000');
    expect(validateCompartment(c).some((i) => /no condensing unit/.test(i.message))).toBe(true);
    c = addCondenser(c, 'indoor').compartment;
    c = updateCondenser(c, 'cu1', { model: 'ICC-SUIC500' });
    expect(validateCompartment(c).some((i) => i.severity === 'error' && /too small/.test(i.message))).toBe(true);
  });

  it('groups evaporators on one unit only while a model can carry them, and goes outdoor when indoor is too small', () => {
    let c: Compartment = { ...defaultCompartment(), boxW: ft(28), boxD: ft(14) };
    c = suggestEvaporators(c).compartment; // two EVC1500s, 34,238 BTU/h together
    const m = matchAllEvaporators(c, 'indoor');
    expect(unservedEvaporators(m)).toEqual([]);
    m.condensers.forEach((u) => expect(validateCompartment(m).some((i) => i.severity === 'error' && i.message.includes(u.id.replace('cu', 'CU')))).toBe(false));
    const big = addCondenser(withEvap('ICC-EVC3000'), 'indoor').compartment;
    expect(getCondenser(big.condensers[0].model).type).toBe('outdoor');
  });

  it('swaps to a freezer unit of the same type when the room turns freezer', () => {
    const c = addCondenser(withEvap(), 'indoor').compartment;
    const f = normalizeCompartment({ ...c, temperature: 'freezer' });
    expect(getCondenser(f.condensers[0].model).line).toBe('freezer');
    expect(getCondenser(f.condensers[0].model).type).toBe('indoor');
  });

  it('warns past the Smart Control limit and asks for the Control Box', () => {
    let c: Compartment = { ...defaultCompartment(), boxW: ft(30), boxD: ft(28), temperature: 'freezer' };
    c = matchAllEvaporators(suggestEvaporators(normalizeCompartment(c)).compartment, 'indoor');
    c = { ...c, condensers: c.condensers.map((u) => ({ ...u, model: 'ICC-SUIF2000' })) };
    expect(validateCompartment(c).some((i) => /Control Box/.test(i.message))).toBe(true);
  });
});

describe('packaged units', () => {
  const packagedRoom = (w = 12, d = 12): Compartment => setSystem({ ...defaultCompartment(), boxW: ft(w), boxD: ft(d) }, 'packaged');

  it('live in their own system: no split evaporators, no condensing units', () => {
    const c = addEvaporator(packagedRoom()).compartment;
    expect(getEvaporator(c.evaporators[0].model).kind).toBe('packaged');
    expect(validateCompartment(c).some((i) => /no condensing unit/.test(i.message))).toBe(false);
    // Switching back to split clears them (undoable in the app).
    expect(setSystem(c, 'split').evaporators).toEqual([]);
    // A packaged model in a split compartment is dropped on normalize.
    expect(normalizeCompartment({ ...c, system: 'split' }).evaporators).toEqual([]);
  });

  it('places the plug inside the room and the cabinet on the roof, and builds the drawing model', () => {
    const c = addEvaporator(packagedRoom()).compartment;
    const e = c.evaporators[0];
    expect(checkEvaporator(c, e).errors).toEqual([]);
    const cab = packagedCabinet(c, e)!;
    expect(cab).toHaveLength(4);
    const t = buildCompartment(c, 'indoor');
    const m = t.parts.find((p): p is ModelPart => p.kind === 'model' && p.model === 'PACKAGED')!;
    expect(m.params!.plugW).toBeCloseTo(24.57, 2); // 624 mm
    expect(t.parts.some((p) => p.kind === 'zone')).toBe(true);
  });

  it('flags a cabinet hanging off the roof', () => {
    const c = addEvaporator(packagedRoom(8, 8)).compartment;
    const e = c.evaporators[0];
    // The cabinet sits off to one side of its plug (as drawn), so it overhangs at the far end of the wall.
    const wallLen = framesFor(c)[e.wall].length;
    const moved = { ...c, evaporators: [{ ...e, offset: wallLen - getEvaporator(e.model).length / 2 - 10 }] };
    const errs = checkEvaporator(moved, moved.evaporators[0]).errors;
    expect(errs.some((m) => /off the roof/.test(m))).toBe(true);
  });
});

describe('drawing sizes (inches)', () => {
  it('takes condensing unit sizes from ICC drawings, nearest family where there is none', () => {
    expect(getCondenser('ICC-SUOC500').shape.w).toBeCloseTo(43.07, 2); // 1094 mm
    expect(getCondenser('ICC-SUOC700').shape).toEqual(getCondenser('ICC-SUOC500').shape);
    expect(getCondenser('ICC-SUIC386').shape).toEqual(getCondenser('ICC-SUIC1000').shape);
    expect(getCondenser('ICC-SUOF2000').shape.fanLayout).toBe('stack');
    expect(getCondenser('ICC-SUIF1500').shape.fanLayout).toBe('side');
    expect(getCondenser('ICC-SUOF4000').shape.h).toBeCloseTo(55.46, 2); // 1408.6 mm
  });
});
