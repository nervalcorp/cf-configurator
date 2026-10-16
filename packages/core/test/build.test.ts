import { describe, expect, it } from 'vitest';
import {
  SHAPES,
  addDoor,
  buildCompartment,
  defaultCompartment,
  inToMm,
  updateDoor,
  wallProfile,
  type BoxPart,
  type Compartment,
  type WallPart,
} from '../src';

const comp = (patch: Partial<Compartment> = {}): Compartment => ({ ...defaultCompartment(), ...patch });

describe('buildCompartment', () => {
  it('builds a rectangle as 4 posts, 4 walls and one door', () => {
    const t = buildCompartment(comp(), 'indoor');
    const kinds = (k: string) => t.parts.filter((p) => p.kind === k).length;
    expect(kinds('post')).toBe(4);
    expect(kinds('wall')).toBe(4);
    expect(kinds('door-leaf')).toBe(1);
    expect(kinds('floor')).toBe(1);
    expect(kinds('roof')).toBe(0);
    expect(t.walls.map((w) => w.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(t.doors.map((d) => d.sku)).toEqual(['ICC-DR-3478CR']);
  });

  it('adds a roof outdoors and drops the floor when asked', () => {
    const c = comp();
    c.finishes = { ...c.finishes, floor: 'none' };
    const t = buildCompartment(c, 'outdoor');
    expect(t.parts.some((p) => p.kind === 'roof')).toBe(true);
    expect(t.parts.some((p) => p.kind === 'floor')).toBe(false);
    expect(t.floorTop).toBe(0);
  });

  it.each(SHAPES.map((s) => [s.id] as const))('%s: one post per corner and one wall per edge', (id) => {
    const s = SHAPES.find((x) => x.id === id)!;
    const t = buildCompartment(comp({ shape: id, notchW: s.nw, notchD: s.nd, doors: [] }), 'indoor');
    expect(t.parts.filter((p) => p.kind === 'post').length).toBe(t.footprint.length);
    expect(t.parts.filter((p) => p.kind === 'wall').length).toBe(t.footprint.length);
  });

  it('cuts the door opening (plus frame) out of the wall it sits in', () => {
    const t = buildCompartment(comp(), 'indoor');
    const a = t.parts.find((p): p is WallPart => p.kind === 'wall' && p.letter === 'A')!;
    expect(a.profile.length).toBe(8); // rectangle + one notch
    const b = t.parts.find((p): p is WallPart => p.kind === 'wall' && p.letter === 'B')!;
    expect(b.profile.length).toBe(4);
  });

  it('turns parts on a side wall to face outward', () => {
    let c = comp({ doors: [] });
    c = addDoor(c).compartment;
    c = updateDoor(c, c.doors[0].id, { wall: 1, offset: inToMm(20) }); // right wall of the default rectangle
    const t = buildCompartment(c, 'indoor');
    const leaf = t.parts.find((p): p is BoxPart => p.kind === 'door-leaf')!;
    expect(leaf.rotationY).toBeCloseTo(Math.PI / 2, 9);
    expect(leaf.center[0]).toBeGreaterThan(inToMm(70));
    expect(t.doors[0].wall).toBe('B');
  });

  it('mirrors the hinges for a left-hinged door', () => {
    const right = buildCompartment(comp(), 'indoor');
    const c = comp();
    const left = buildCompartment(updateDoor(c, c.doors[0].id, { hinge: 'left' }), 'indoor');
    const hx = (t: typeof right) => (t.parts.find((p) => p.kind === 'hinge') as BoxPart).center[0];
    const leaf = right.parts.find((p) => p.kind === 'door-leaf') as BoxPart;
    expect(hx(right)).toBeGreaterThan(leaf.center[0]);
    expect(hx(left)).toBeLessThan(leaf.center[0]);
  });

  it('adds closer and window parts only when chosen', () => {
    const c = comp();
    const plain = buildCompartment(c, 'indoor');
    expect(plain.parts.some((p) => p.kind === 'closer' || p.kind === 'window')).toBe(false);
    const dressed = buildCompartment(updateDoor(c, 'd1', { closer: true, series: '13478', window: true }), 'indoor');
    expect(dressed.parts.some((p) => p.kind === 'closer')).toBe(true);
    expect(dressed.parts.some((p) => p.kind === 'window')).toBe(true);
    expect(dressed.doors[0].sku).toBe('ICC-DR-13478CRW');
  });

  it('labels one dimension per edge plus height', () => {
    const t = buildCompartment(comp(), 'indoor');
    expect(t.dimensions.map((d) => d.label)).toEqual(['150"', '150"', '150"', '150"', '100"']);
  });
});

describe('wallProfile', () => {
  it('is a rectangle without openings', () => {
    expect(wallProfile(1000, 2000, [])).toEqual([[0, 0], [1000, 0], [1000, 2000], [0, 2000]]);
  });
  it('merges overlapping openings', () => {
    const p = wallProfile(3000, 2000, [[100, 900, 1500], [800, 1600, 1800]]);
    expect(p).toEqual([[0, 0], [100, 0], [100, 1800], [1600, 1800], [1600, 0], [3000, 0], [3000, 2000], [0, 2000]]);
  });
  it('handles an opening that touches the wall end', () => {
    const p = wallProfile(1000, 2000, [[0, 400, 1500]]);
    expect(p[0]).toEqual([0, 1500]);
  });
});
