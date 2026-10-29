import { describe, expect, it } from 'vitest';
import {
  GLASS_SERIES,
  addDoor,
  buildCompartment,
  defaultCompartment,
  doorSize,
  doorSku,
  doorTag,
  glassUnitSize,
  inToMm,
  mmToIn,
  normalizeCompartment,
  updateDoor,
  validateCompartment,
  type BoxPart,
  type Compartment,
} from '../src';

const withGlass = (glass: Partial<Compartment['doors'][number]['glass']> = {}) => {
  const base = { ...defaultCompartment(), boxW: inToMm(180) };
  const r = addDoor(base, 'glass');
  const c = updateDoor(r.compartment, r.id!, { glass: { ...r.compartment.doors[1].glass, ...glass } });
  return { c, id: r.id! };
};

describe('glass door catalog', () => {
  it('has the ten ICC models', () => {
    const skus = GLASS_SERIES.flatMap((s) =>
      s.finishes.flatMap((f) => ([2, 3] as const).map((count) => doorSku({ ...defaultCompartment().doors[0], family: 'glass', glass: { series: s.id, finish: f.id, count } }, 'cooler'))),
    );
    expect(skus.sort()).toEqual(
      [
        'ICC-GD-ELITE-AN-2D', 'ICC-GD-ELITE-AN-3D', 'ICC-GD-ELITE-BK-2D', 'ICC-GD-ELITE-BK-3D',
        'ICC-GD-SELECT-2D', 'ICC-GD-SELECT-3D',
        'ICC-GD-SIGNATURE-BK-2D', 'ICC-GD-SIGNATURE-BK-3D', 'ICC-GD-SIGNATURE-SV-2D', 'ICC-GD-SIGNATURE-SV-3D',
      ].sort(),
    );
  });

  it('sizes units from 30" doors plus a 1.5" frame', () => {
    expect(mmToIn(glassUnitSize({ series: 'elite', finish: 'BK', count: 2 }).width)).toBeCloseTo(63, 6);
    expect(mmToIn(glassUnitSize({ series: 'elite', finish: 'BK', count: 3 }).width)).toBeCloseTo(93, 6);
    expect(mmToIn(glassUnitSize({ series: 'select', finish: 'BK', count: 2 }).height)).toBeCloseTo(69, 6);
    expect(mmToIn(glassUnitSize({ series: 'signature', finish: 'AN', count: 2 }).height)).toBeCloseTo(75, 6);
  });

  it('keeps Select glossy black', () => {
    const { c, id } = withGlass({ series: 'select', finish: 'AN' });
    expect(normalizeCompartment(c).doors.find((d) => d.id === id)!.glass.finish).toBe('BK');
  });
});

describe('glass door units', () => {
  it('tags glass units G1 and keeps doors D1', () => {
    const { c, id } = withGlass();
    expect(doorTag(c.doors, 'd1')).toBe('D1');
    expect(doorTag(c.doors, id)).toBe('G1');
  });

  it('places a unit with room for its full width and validates clean', () => {
    const { c, id } = withGlass({ count: 3 });
    const d = c.doors.find((x) => x.id === id)!;
    expect(mmToIn(doorSize(d).width)).toBeCloseTo(93, 6);
    expect(validateCompartment(c).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('builds one glass pane and handle per door, frameless without door rails', () => {
    const { c } = withGlass({ series: 'signature', count: 3 });
    const t = buildCompartment(c, 'indoor');
    const of = (k: string) => t.parts.filter((p) => p.kind === k && 'doorId' in p && p.doorId !== 'd1');
    expect(of('glass')).toHaveLength(3);
    expect(t.parts.filter((p) => p.id.match(/:g\d-handle$/))).toHaveLength(3);
    expect(t.parts.some((p) => p.id.includes('-stile-'))).toBe(false);
    expect(of('logo')).toHaveLength(1);
  });

  it('opens 2-door units from the centre', () => {
    const { c } = withGlass({ count: 2 });
    const t = buildCompartment(c, 'indoor');
    const h = t.parts.filter((p): p is BoxPart => /:g\d-handle$/.test(p.id)).map((p) => p.center[0]);
    expect(Math.abs(h[0] - h[1])).toBeLessThan(inToMm(4));
  });

  it('sends glass problems to the Glass doors step', () => {
    const { c } = withGlass();
    const issues = validateCompartment({ ...c, height: inToMm(90), boxW: inToMm(96) });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.filter((i) => i.ref && i.ref !== 'd1').every((i) => i.tab === 'glass')).toBe(true);
  });
});
