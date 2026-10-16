import { describe, expect, it } from 'vitest';
import { LIMITS, defaultCompartment, defaultConfiguration, dragHandle, footprint, inToMm, migrate, mmToIn, normalizeCompartment, pickHandle, validateCompartment } from '../src';

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
  it('locks the colour to the chosen stock finish', () => {
    const c = defaultCompartment();
    const n = normalizeCompartment({ ...c, finishes: { ...c.finishes, exterior: 'white', exteriorColor: '#123456' } });
    expect(n.finishes.exteriorColor).toBe('#f0f0f0');
  });
});

describe('validate', () => {
  it('accepts the default compartment', () => {
    expect(validateCompartment(defaultCompartment())).toEqual([]);
  });
  it('flags a door that runs past the wall and sends the user to Doors', () => {
    const c = defaultCompartment();
    const issues = validateCompartment({ ...c, boxW: inToMm(72), door: { ...c.door, offset: inToMm(40) } });
    expect(issues.map((i) => i.tab)).toEqual(['doors']);
  });
  it('flags a door wall under 72"', () => {
    const issues = validateCompartment({ ...defaultCompartment(), shape: 'cutout-a', boxW: inToMm(84), notchW: 0.5 });
    expect(issues.some((i) => i.tab === 'layout')).toBe(true);
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
    const c = { ...defaultCompartment(), shape: 'cutout-d' as const };
    const next = dragHandle(c, { type: 'notchD', notch: 'br' }, [0, inToMm(60)]);
    expect(next.notchD).toBeCloseTo(60 / 150, 6);
  });

  it('refuses a notch that would shrink the door wall under 72"', () => {
    const c = { ...defaultCompartment(), shape: 'cutout-a' as const, boxW: inToMm(120), notchW: 0.2 };
    const next = dragHandle(c, { type: 'notchW', notch: 'tr' }, [inToMm(72), 0]);
    expect(next.notchW).toBeCloseTo(0.4, 6); // 48" notch leaves exactly 72"
    const tooFar = dragHandle(next, { type: 'notchW', notch: 'tr' }, [inToMm(66), 0]);
    expect(tooFar.notchW).toBeCloseTo(0.4, 6);
  });
});

describe('migrate', () => {
  it('reads back what it saved', () => {
    const cfg = defaultConfiguration();
    expect(migrate(JSON.parse(JSON.stringify(cfg)))).toEqual(cfg);
  });
  it('rejects unknown files', () => {
    expect(() => migrate({ schema: 99 })).toThrow(/schema/);
  });
});
