import { describe, expect, it } from 'vitest';
import {
  CHECKER_PLATE,
  addDoor,
  buildCompartment,
  defaultCompartment,
  doorsClash,
  flaggedParts,
  inToMm,
  mmToIn,
  normalizeCompartment,
  paintSquares,
  slideDoor,
  squareBlocker,
  squaresBelow,
  toggleSquare,
  updateDoor,
  validateCompartment,
  type BoxPart,
  type Compartment,
} from '../src';

/** Front wall 240" with two Elite 2-door units (63" each) and the man door moved to wall B. */
function twoUnits(): { c: Compartment; a: string; b: string } {
  const base = defaultCompartment();
  let c: Compartment = { ...base, boxW: inToMm(240), doors: [], control: { ...base.control, model: 'none' } };
  const a = addDoor(c, 'glass');
  c = a.compartment;
  const b = addDoor(c, 'glass');
  c = b.compartment;
  c = updateDoor(c, a.id!, { offset: inToMm(10) });
  c = updateDoor(c, b.id!, { offset: inToMm(80) });
  return { c, a: a.id!, b: b.id! };
}

describe('glass units side by side', () => {
  it('lets two units of the same height touch without a flag', () => {
    const { c, a, b } = twoUnits();
    const touching = updateDoor(c, b, { offset: inToMm(10 + 63) });
    expect(doorsClash(touching.doors[0], touching.doors[1])).toBe(false);
    expect(validateCompartment(touching).filter((i) => i.severity === 'error')).toEqual([]);
    expect(a).not.toBe(b);
  });

  it('flags touching units of different heights', () => {
    const { c, b } = twoUnits();
    const mixed = updateDoor(c, b, { offset: inToMm(73), glass: { series: 'select', finish: 'BK', count: 2 } });
    const issues = validateCompartment(mixed);
    expect(issues.some((i) => /same height/.test(i.message))).toBe(true);
  });

  it('stops a dragged unit where it meets its neighbour', () => {
    const { c, b } = twoUnits();
    const moved = slideDoor(c, b, inToMm(20)); // try to drag through unit a
    expect(mmToIn(moved.doors.find((d) => d.id === b)!.offset)).toBeCloseTo(73, 6);
  });
});

describe('glass lift', () => {
  it('raises a unit up to 3 ft and cuts a hole instead of a notch', () => {
    const { c, a } = twoUnits();
    const raised = normalizeCompartment(updateDoor(c, a, { elevation: inToMm(50) }));
    // 100" panels leave 100 - 75 (unit) - 2 (headroom) = 23" of lift; 50" asked for.
    expect(mmToIn(raised.doors[0].elevation)).toBeCloseTo(23, 6);
    const t = buildCompartment(raised, 'indoor');
    const wallA = t.parts.find((p) => p.kind === 'wall' && p.letter === 'A') as unknown as { profiles: { holes: unknown[] }[] };
    expect(wallA.profiles[0].holes).toHaveLength(1);
  });
});

describe('checker plates', () => {
  it('fills whole squares under a raised unit', () => {
    let { c, a } = twoUnits();
    c = { ...c, height: inToMm(120) };
    c = normalizeCompartment(updateDoor(c, a, { elevation: inToMm(24) }));
    const qs = squaresBelow(c, c.doors[0]);
    // Unit spans 10"..73" → columns 0..6, two rows under 24". Column 6 (72"-84")
    // runs into the next unit (from 80"), so its two squares are blocked.
    expect(qs).toHaveLength(6 * 2);
    const filled = paintSquares(c, qs, true);
    expect(validateCompartment(filled).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('will not place a square over a door opening', () => {
    const c = defaultCompartment(); // man door at 19" on the front wall
    expect(squareBlocker(c, { wall: 2, col: 2, row: 0 })).toMatch(/door/);
    expect(toggleSquare(c, { wall: 2, col: 2, row: 0 }).accessories.checker).toHaveLength(0);
  });

  it('maps every square in wall coordinates so the pattern runs on across squares', () => {
    const c = paintSquares({ ...defaultCompartment(), doors: [] }, [{ wall: 0, col: 3, row: 1 }, { wall: 0, col: 4, row: 1 }], true);
    const plates = buildCompartment(c, 'indoor').parts.filter((p): p is BoxPart => p.kind === 'plate');
    expect(plates).toHaveLength(2);
    expect(plates[0].wallRect![2]).toBeCloseTo(plates[1].wallRect![0], 6); // edges meet
    expect(plates[0].wallRect![0]).toBeCloseTo(3 * CHECKER_PLATE.size, 6);
  });

  it('flags a square that a door was moved over', () => {
    let c = paintSquares({ ...defaultCompartment() }, [{ wall: 2, col: 8, row: 0 }], true);
    c = updateDoor(c, 'd1', { offset: inToMm(90) });
    const issues = validateCompartment(c);
    const plate = issues.find((i) => i.tab === 'accessories');
    expect(plate).toBeTruthy();
    const flags = flaggedParts(buildCompartment(c, 'indoor'), issues);
    expect([...flags.keys()].some((k) => k.includes(':plate-'))).toBe(true);
  });
});

describe('controller', () => {
  it('starts beside the first door on its latch side at eye level', () => {
    const c = normalizeCompartment({ ...defaultCompartment(), control: { model: 'TSC2000', wall: -1, offset: 0, height: 0 } });
    expect(c.control.wall).toBe(2);
    expect(c.control.offset).toBeLessThan(c.doors[0].offset); // hinged right → latch on the left
    expect(mmToIn(c.control.height)).toBeCloseTo(60, 6);
  });

  it('keeps the height between 40" and 66"', () => {
    const c = normalizeCompartment({ ...defaultCompartment(), control: { ...defaultCompartment().control, height: inToMm(90) } });
    expect(mmToIn(c.control.height)).toBeCloseTo(66, 6);
  });

  it('flags a controller over a door', () => {
    const c = { ...defaultCompartment(), control: { ...defaultCompartment().control, offset: inToMm(30) } };
    const issues = validateCompartment(c);
    expect(issues.some((i) => i.tab === 'refrigeration' && i.severity === 'error')).toBe(true);
  });

  it('builds the TSC2000 from its artwork, and keeps the wall below it clear for the cable', () => {
    const c = defaultCompartment();
    const t = buildCompartment(c, 'indoor');
    expect(t.parts.filter((p) => p.kind === 'model' && (p as { model: string }).model === 'TSC2000')).toHaveLength(1);
    // A checker plate square just under the housing would cover the cable and gland.
    const row = Math.floor((c.control.height - inToMm(2.2) - inToMm(1)) / CHECKER_PLATE.size);
    const col = Math.floor(c.control.offset / CHECKER_PLATE.size);
    expect(squareBlocker(c, { wall: c.control.wall, col, row })).toMatch(/controller/);
  });
});
