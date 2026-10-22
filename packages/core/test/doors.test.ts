import { describe, expect, it } from 'vitest';
import {
  addDoor,
  buildCompartment,
  flaggedParts,
  defaultCompartment,
  doorSku,
  doorSpan,
  dragHandle,
  framesFor,
  inToMm,
  mmToIn,
  moveDoor,
  newDoor,
  normalizeCompartment,
  setShape,
  updateDoor,
  validateCompartment,
} from '../src';

describe('door model numbers', () => {
  const d = newDoor('d1', 0, 0);
  it('encodes temperature and hinge for man doors', () => {
    expect(doorSku(d, 'cooler')).toBe('ICC-DR-3478CR');
    expect(doorSku({ ...d, hinge: 'left' }, 'freezer')).toBe('ICC-DR-3478FL');
  });
  it('only gives 13478 doors a window suffix', () => {
    expect(doorSku({ ...d, series: '13478', window: true }, 'cooler')).toBe('ICC-DR-13478CRW');
    expect(doorSku({ ...d, window: true }, 'cooler')).toBe('ICC-DR-3478CR');
  });
  it('covers the other door types', () => {
    expect(doorSku({ ...d, family: 'pallet' }, 'freezer')).toBe('ICC-DR-4878FR');
    expect(doorSku({ ...d, family: 'slide-forklift', hinge: 'left' }, 'cooler')).toBe('ICC-DR-7296L');
    expect(doorSku({ ...d, family: 'rollup' }, 'cooler')).toBe('ICC-DR-96120');
    expect(doorSku({ ...d, family: 'traffic-double', finish: 'BK' }, 'cooler')).toBe('ICC-DR-7284DS-BK');
  });
});

describe('placing doors', () => {
  it('adds a second door on the front wall beside the first', () => {
    const { compartment: c, id } = addDoor(defaultCompartment());
    const [a, b] = c.doors;
    expect(id).toBe('d2');
    expect(b.wall).toBe(a.wall);
    expect(doorSpan(b).from).toBeGreaterThanOrEqual(doorSpan(a).to);
    expect(validateCompartment(c)).toEqual([]);
  });

  it('spills onto another wall when the front is full', () => {
    let c = defaultCompartment();
    for (let i = 0; i < 4; i++) c = addDoor(c).compartment;
    const walls = new Set(c.doors.map((d) => d.wall));
    expect(walls.size).toBeGreaterThan(1);
    expect(validateCompartment(c)).toEqual([]);
  });

  it('moves a door to a side wall, as close as it can to the asked position', () => {
    const c = moveDoor(defaultCompartment(), 'd1', 1, inToMm(60));
    expect(c.doors[0].wall).toBe(1);
    expect(mmToIn(c.doors[0].offset)).toBeCloseTo(60, 6);
  });

  it('reserves slide travel beside a sliding door', () => {
    const c = defaultCompartment();
    const d = { ...c.doors[0], family: 'slide-pallet' as const, hinge: 'right' as const };
    const s = doorSpan(d, 0);
    expect(mmToIn(s.to - s.from)).toBeCloseTo(54 + 54 + 8, 6);
  });

  it('puts doors back on the new front wall when the shape changes', () => {
    let c = moveDoor(defaultCompartment(), 'd1', 1);
    c = setShape(c, 'cutout-e', 0.4, 0.2);
    const front = framesFor(c).find((f) => f.letter === 'A')!;
    expect(c.doors[0].wall).toBe(front.edge);
    expect(validateCompartment(normalizeCompartment(c)).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('door rules', () => {
  it('flags doors that overlap', () => {
    let c = addDoor(defaultCompartment()).compartment;
    c = updateDoor(c, 'd2', { offset: c.doors[0].offset + inToMm(10) });
    expect(validateCompartment(c).some((i) => i.ref === 'd1' && i.tab === 'doors')).toBe(true);
  });

  it('flags a door taller than the walls allow', () => {
    const c = updateDoor(defaultCompartment(), 'd1', { family: 'slide-pallet', offset: inToMm(10) });
    expect(validateCompartment({ ...c, height: inToMm(100) }).some((i) => /high/.test(i.message))).toBe(true);
    expect(validateCompartment({ ...c, height: inToMm(104) }).filter((i) => /high/.test(i.message))).toEqual([]);
  });

  it('marks every part of a flagged door, and only that door', () => {
    let c = addDoor({ ...defaultCompartment(), height: inToMm(110), boxW: inToMm(240) }).compartment;
    c = moveDoor(c, 'd2', 1); // second, valid door on another wall
    c = updateDoor(c, 'd1', { family: 'rollup', offset: inToMm(4) });
    const tree = buildCompartment(c, 'indoor');
    const flags = flaggedParts(tree, validateCompartment(c));
    const d1 = tree.parts.filter((p) => 'doorId' in p && p.doorId === 'd1').map((p) => p.id);
    expect([...flags.keys()].sort()).toEqual(d1.sort());
    expect(flags.get(d1[0])![0]).toMatch(/10' 0"/);
  });

  it('allows the roll-up only in a cooler with 120" panels', () => {
    const base = { ...defaultCompartment(), boxW: inToMm(180) };
    const c = updateDoor(base, 'd1', { family: 'rollup', offset: inToMm(30) });
    expect(validateCompartment({ ...c, height: inToMm(120) })).toEqual([]);
    expect(validateCompartment({ ...c, height: inToMm(118) }).some((i) => /120|10' 0"/.test(i.message))).toBe(true);
    expect(validateCompartment({ ...c, height: inToMm(120), temperature: 'freezer' }).some((i) => /coolers only/.test(i.message))).toBe(true);
  });

  it('warns when there is no door', () => {
    const issues = validateCompartment({ ...defaultCompartment(), doors: [] });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('keeps doors on their wall when the box shrinks', () => {
    const c = updateDoor(defaultCompartment(), 'd1', { offset: inToMm(100) });
    const n = normalizeCompartment({ ...c, boxW: inToMm(96) });
    const run = framesFor(n)[n.doors[0].wall].length;
    expect(doorSpan(n.doors[0]).to).toBeLessThanOrEqual(run + 0.01);
  });

  it('refuses a drag that leaves a wall too short for its doors', () => {
    // A 54" sliding door needs 116" of inside run (opening + travel + guides).
    const base = defaultCompartment();
    const c = { ...base, doors: [{ ...base.doors[0], family: 'slide-pallet' as const, offset: inToMm(4) }] };
    const ok = dragHandle(c, { type: 'box', dx: 1, dy: 0 }, [inToMm(126), 0]); // 118" inside
    expect(mmToIn(ok.boxW)).toBeCloseTo(126, 6);
    const tooNarrow = dragHandle(c, { type: 'box', dx: 1, dy: 0 }, [inToMm(120), 0]); // 112" inside
    expect(mmToIn(tooNarrow.boxW)).toBeCloseTo(150, 6);
  });

  it('drops options a door type does not have', () => {
    const c = updateDoor(defaultCompartment(), 'd1', { family: 'traffic-single', closer: true, window: true, swing: 'in' });
    const d = normalizeCompartment(c).doors[0];
    expect([d.closer, d.window, d.swing]).toEqual([false, false, 'out']);
  });
});
