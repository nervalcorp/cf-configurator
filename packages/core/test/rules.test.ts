import { describe, expect, it } from 'vitest';
import { LIMITS, setShape, defaultCompartment, defaultConfiguration, dragHandle, footprint, inToMm, migrate, mmToIn, normalize, normalizeCompartment, pickHandle, validateCompartment } from '../src';

describe('normalize', () => {
  it('gives a freezer a floor', () => {
    const c = defaultCompartment();
    const n = normalizeCompartment({ ...c, temperature: 'freezer', finishes: { ...c.finishes, floor: 'none' } });
    expect(n.finishes.floor).toBe('standard');
  });
  it('clamps the box and notch into range', () => {
    const c = normalizeCompartment({ ...defaultCompartment(), shape: 'cutout-a', boxW: 10, notchW: 0.9 });
    expect(c.boxW).toBe(LIMITS.box.min);
    expect(c.notchW).toBe(0.5);
  });
  it('uses the decal background as the wall colour for logo decals', () => {
    const c = defaultCompartment();
    const n = normalizeCompartment({ ...c, finishes: { ...c.finishes, exterior: 'decal', decal: { ...c.finishes.decal, background: '#112233', tile: 1 } } });
    expect(n.finishes.exteriorColor).toBe('#112233');
    expect(n.finishes.decal.tile).toBe(LIMITS.decal.tileMin);
  });
  it('locks the colour to the chosen stock finish', () => {
    const c = defaultCompartment();
    const n = normalizeCompartment({ ...c, finishes: { ...c.finishes, exterior: 'white', exteriorColor: '#123456' } });
    expect(n.finishes.exteriorColor).toBe('#f0f0f0');
  });
});

describe('validate', () => {
  it('accepts the default compartment', () => {
    expect(validateCompartment(defaultCompartment()).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('flags a door that runs past the wall and sends the user to Doors', () => {
    const c = defaultCompartment();
    const issues = validateCompartment({ ...c, boxW: inToMm(72), doors: [{ ...c.doors[0], offset: inToMm(40) }] });
    expect(issues.filter((i) => i.severity === 'error').map((i) => [i.tab, i.ref])).toEqual([['doors', 'd1']]);
  });
});

describe('drag', () => {
  it('resizes the box from its front-right corner on a 6" grid', () => {
    const c = defaultCompartment();
    const fp = footprint(c.shape, c.boxW, c.boxD, 0, 0);
    const vi = fp.findIndex(([x, y]) => x === c.boxW && y === c.boxD);
    const h = pickHandle(c, vi)!;
    expect(h).toEqual({ type: 'box', dx: 1, dy: 1 });
    const next = dragHandle(c, h, [inToMm(200), inToMm(97)]);
    expect(mmToIn(next.boxW)).toBeCloseTo(198, 9);
    expect(mmToIn(next.boxD)).toBeCloseTo(96, 9);
  });

  it('classifies the inside notch corner as a two-axis notch handle', () => {
    const c = { ...defaultCompartment(), shape: 'cutout-a' as const };
    const fp = footprint(c.shape, c.boxW, c.boxD, c.notchW, c.notchD);
    const vi = fp.findIndex(([x, y]) => x > 0 && x < c.boxW && y > 0 && y < c.boxD);
    expect(pickHandle(c, vi)).toEqual({ type: 'notchBoth', notch: 'tr' });
  });

  it('grows a back-side (br) notch when its corner moves toward the front', () => {
    const c = setShape(defaultCompartment(), 'cutout-d', 0.2, 0.2);
    const next = dragHandle(c, { type: 'notchD', notch: 'br' }, [0, inToMm(60)]);
    expect(next.notchD).toBeCloseTo(60 / 150, 6);
  });

  it('refuses a notch that would leave the door no room', () => {
    // Cut-out A front wall = box width minus notch. A 34" man door needs 43" inside
    // (opening + 4.5" each side), plus 8" of corner posts = 51" outside.
    const c = setShape({ ...defaultCompartment(), boxW: inToMm(96) }, 'cutout-a', 0.2, 0.2);
    const next = dragHandle(c, { type: 'notchW', notch: 'tr' }, [inToMm(54), 0]);
    expect(next.notchW).toBeCloseTo(42 / 96, 6); // 54" wall left: fits
    const pallet = { ...c, doors: [{ ...c.doors[0], family: 'pallet' as const }] };
    const tooFar = dragHandle(pallet, { type: 'notchW', notch: 'tr' }, [inToMm(54), 0]);
    expect(tooFar.notchW).toBeCloseTo(0.2, 6); // a 48" pallet door needs 65" of wall
  });
});

describe('migrate', () => {
  it('reads back what it saved', () => {
    const cfg = defaultConfiguration();
    expect(migrate(JSON.parse(JSON.stringify(cfg)))).toEqual(cfg);
  });
  it('upgrades a v1 file with a single front door', () => {
    const v1 = { schema: 1, site: { type: 'indoor' }, compartments: [{ ...defaultCompartment(), doors: undefined, door: { width: 863.6, offset: 400, hinge: 'left' } }] };
    const cfg = normalize(migrate(v1));
    const d = cfg.compartments[0].doors[0];
    expect(cfg.schema).toBe(10);
    expect([d.wall, d.hinge, d.family]).toEqual([2, 'left', 'man']);
    expect(d.offset).toBeCloseTo(400, 6);
  });
  it('turns retired stucco finishes into White Coated', () => {
    const c = defaultCompartment();
    const v2 = { schema: 2, site: { type: 'indoor' }, compartments: [{ ...c, finishes: { exterior: 'stucco-aluminum', exteriorColor: '#c4c8cc', floor: 'standard' } }] };
    const f = normalize(migrate(v2)).compartments[0].finishes;
    expect(f.exterior).toBe('white');
    expect(f.decal.angle).toBe(45);
  });
  it('rejects unknown files', () => {
    expect(() => migrate({ schema: 99 })).toThrow(/schema/);
  });
});
