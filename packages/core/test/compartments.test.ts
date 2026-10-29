import { describe, expect, it } from 'vitest';
import {
  addCompartment,
  besidePosition,
  buildCompartment,
  defaultCompartment,
  defaultConfiguration,
  duplicateCompartment,
  inToMm,
  migrate,
  normalize,
  overlappingCompartments,
  removeCompartment,
  resizedPosition,
  updateDoor,
  validate,
  type RampPart,
  type SlabPart,
} from '../src';

describe('compartments', () => {
  it('adds Compartment 2 touching the right of Compartment 1, fronts in line', () => {
    const { config, id } = addCompartment(defaultConfiguration(), (i, n) => defaultCompartment(i, n));
    const [a, b] = config.compartments;
    expect(b.id).toBe(id);
    expect(b.name).toBe('Compartment 2');
    expect(b.position.x - b.boxW / 2).toBeCloseTo(a.position.x + a.boxW / 2, 6);
    expect(b.position.z + b.boxD / 2).toBeCloseTo(a.position.z + a.boxD / 2, 6);
    expect(overlappingCompartments(config)).toEqual([]);
    expect(validate(config).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('duplicates everything but the id, name and position', () => {
    let cfg = defaultConfiguration();
    cfg = { ...cfg, compartments: [{ ...cfg.compartments[0], temperature: 'freezer' }] };
    const { config, id } = duplicateCompartment(cfg, 'c1');
    const copy = config.compartments.find((c) => c.id === id)!;
    expect(copy.temperature).toBe('freezer');
    expect(copy.doors).toEqual(cfg.compartments[0].doors);
    expect(copy.name).toBe('Compartment 1 copy');
  });

  it('flags overlapping compartments on both', () => {
    const { config } = addCompartment(defaultConfiguration(), (i, n) => defaultCompartment(i, n));
    const moved = { ...config, compartments: config.compartments.map((c) => (c.id === 'c2' ? { ...c, position: { x: inToMm(100), z: 0 } } : c)) };
    const issues = validate(moved).filter((i) => /overlaps/.test(i.message));
    expect(issues.map((i) => i.compartmentId).sort()).toEqual(['c1', 'c2']);
  });

  it('places beside any side, touching', () => {
    const a = defaultCompartment();
    const b = { ...defaultCompartment('c2'), boxD: inToMm(96) };
    expect(besidePosition(b, a, 'behind').z).toBeCloseTo(-inToMm(75 + 48), 6);
  });

  it('grows away from a neighbour, and from the centre when alone', () => {
    const { config } = addCompartment(defaultConfiguration(), (i, n) => defaultCompartment(i, n));
    const [a, b] = config.compartments;
    // c1 widens: its right edge (facing c2) stays put, it grows to the left
    const wider = { ...a, boxW: a.boxW + inToMm(24) };
    const pa = resizedPosition(config, a, wider);
    expect(pa.x + wider.boxW / 2).toBeCloseTo(a.position.x + a.boxW / 2, 6);
    // c2 widens: its left edge stays put
    const wb = { ...b, boxW: b.boxW + inToMm(24) };
    const pb = resizedPosition(config, b, wb);
    expect(pb.x - wb.boxW / 2).toBeCloseTo(b.position.x - b.boxW / 2, 6);
    // alone: centre
    const solo = defaultConfiguration();
    const c = solo.compartments[0];
    expect(resizedPosition(solo, c, { ...c, boxW: c.boxW + 600 })).toEqual(c.position);
  });

  it('keeps at least one compartment', () => {
    expect(removeCompartment(defaultConfiguration(), 'c1').compartments).toHaveLength(1);
  });

  it('names and positions older files', () => {
    const v4 = { schema: 4, site: { type: 'indoor' }, compartments: [{ ...defaultCompartment(), name: undefined, position: undefined, accessories: { ramp: 'interior', checker: [] } }] };
    const c = normalize(migrate(v4)).compartments[0];
    expect(c.name).toBe('Compartment 1');
    expect(c.position).toEqual({ x: 0, z: 0 });
    expect(c.accessories.ramp).toBe('exterior');
    expect(c.doors[0].closer).toBe(true); // closer was standard before v7
  });
});

describe('ramp', () => {
  it('puts a 34" × 36" ramp outside a man door, as tall as the floor', () => {
    const t = buildCompartment(defaultCompartment(), 'indoor');
    const r = t.parts.find((p): p is RampPart => p.kind === 'ramp')!;
    expect(r.width).toBeCloseTo(inToMm(34), 6);
    expect(r.length).toBeCloseTo(inToMm(36), 6);
    expect(r.height).toBeCloseTo(t.floorTop, 6);
  });

  it('skips doors of other widths and floors that sit flush', () => {
    const c = defaultCompartment();
    const pallet = buildCompartment(updateDoor(c, 'd1', { family: 'pallet' }), 'indoor');
    expect(pallet.parts.some((p) => p.kind === 'ramp')).toBe(false);
    const recessed = buildCompartment({ ...c, finishes: { ...c.finishes, floor: 'recessed' } }, 'indoor');
    expect(recessed.parts.some((p) => p.kind === 'ramp')).toBe(false);
    const none = buildCompartment({ ...c, accessories: { ...c.accessories, ramp: 'none' } }, 'indoor');
    expect(none.parts.some((p) => p.kind === 'ramp')).toBe(false);
  });

  it('draws a recessed floor as concrete running past the walls', () => {
    const c = defaultCompartment();
    const t = buildCompartment({ ...c, finishes: { ...c.finishes, floor: 'recessed' } }, 'indoor');
    const f = t.parts.find((p): p is SlabPart => p.kind === 'floor')!;
    expect(f.concrete).toBe(true);
    expect(Math.max(...f.polygon.map((p) => p[0]))).toBeGreaterThan(inToMm(75));
  });

  it('puts the height dimension outside the walls', () => {
    const t = buildCompartment(defaultCompartment(), 'indoor');
    const h = t.dimensions[t.dimensions.length - 1];
    expect(Math.abs(h.a[0])).toBeGreaterThan(inToMm(75));
    expect(Math.abs(h.a[2])).toBeGreaterThan(inToMm(75));
  });
});
