import { describe, expect, it } from 'vitest';
import {
  SHAPES,
  addDoor,
  buildCompartment,
  defaultCompartment,
  inToMm,
  mmToIn,
  updateDoor,
  wallProfile,
  wallProfiles,
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
    expect(t.parts.filter((p) => p.id.endsWith(':leaf'))).toHaveLength(1);
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
    expect(a.profiles).toHaveLength(1);
    expect(a.profiles[0].outline.length).toBe(8); // rectangle + one notch
    const b = t.parts.find((p): p is WallPart => p.kind === 'wall' && p.letter === 'B')!;
    expect(b.profiles[0].outline.length).toBe(4);
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

  it('builds walls at the full panel height', () => {
    const t = buildCompartment(comp({ height: inToMm(120) }), 'indoor');
    expect(t.wallHeight).toBeCloseTo(inToMm(120), 6);
    expect(t.overall.height).toBeGreaterThan(inToMm(124));
  });

  it('builds semi- and full-buried leaves at exactly 34" × 78"', () => {
    const c = comp();
    const leafOf = (cc: Compartment) =>
      buildCompartment(cc, 'indoor').parts.find((p): p is BoxPart => p.kind === 'door-leaf' && p.id.endsWith(':leaf'))!;
    const semi = leafOf(c);
    const full = leafOf(updateDoor(c, 'd1', { series: '13478' }));
    for (const leaf of [semi, full]) {
      expect(mmToIn(leaf.size[0])).toBeCloseTo(34, 6);
      expect(mmToIn(leaf.size[1])).toBeCloseTo(78, 6);
      expect(leaf.center[0]).toBeCloseTo(semi.center[0], 6); // same place on the wall
    }
    // Semi-buried stands proud of the wall; full-buried sits flush.
    const frontZ = (b: BoxPart) => b.center[2] + b.size[2] / 2;
    const wallFace = inToMm(75);
    expect(frontZ(semi) - wallFace).toBeGreaterThan(inToMm(2));
    expect(Math.abs(frontZ(full) - wallFace)).toBeLessThan(10);
  });

  it('gives semi-buried doors a heavier frame than full-buried', () => {
    const c = comp();
    const frameOf = (cc: Compartment) =>
      buildCompartment(cc, 'indoor').parts.find((p): p is BoxPart => p.kind === 'door-frame' && p.id.endsWith('frame-l'))!;
    const semi = frameOf(c);
    const full = frameOf(updateDoor(c, 'd1', { series: '13478' }));
    expect(semi.size[0]).toBeGreaterThan(full.size[0]);
    expect(semi.size[2]).toBeGreaterThan(full.size[2]);
  });

  it('marks outside faces on outside corner posts only', () => {
    const t = buildCompartment(comp({ shape: 'cutout-a', notchW: 0.2, notchD: 0.2 }), 'indoor');
    const posts = t.parts.filter((p): p is BoxPart => p.kind === 'post');
    expect(posts.filter((p) => p.exteriorFaces!.length === 2)).toHaveLength(5);
    expect(posts.filter((p) => p.exteriorFaces!.length === 0)).toHaveLength(1);
  });

  it('gives swing doors three cam-lift hinges and a self closer', () => {
    const t = buildCompartment(comp(), 'indoor');
    expect(t.parts.filter((p) => p.kind === 'hinge-pin')).toHaveLength(3);
    expect(t.parts.some((p) => p.id.endsWith('self-closer'))).toBe(true);
  });

  it('splits the wall around a full-height roll-up opening', () => {
    let c = comp({ height: inToMm(120), boxW: inToMm(180) });
    c = updateDoor(c, 'd1', { family: 'rollup', offset: inToMm(30) });
    const t = buildCompartment(c, 'indoor');
    const a = t.parts.find((p): p is WallPart => p.kind === 'wall' && p.letter === 'A')!;
    expect(a.profiles).toHaveLength(2);
    const housing = t.parts.find((p): p is BoxPart => p.kind === 'housing')!;
    expect(housing.center[1] - housing.size[1] / 2).toBeGreaterThan(inToMm(120)); // above the panels
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
  it('splits the wall at a full-height opening', () => {
    const p = wallProfiles(3000, 2000, [
      { from: 1000, to: 2000, bottom: 0, top: 2000 },
      { from: 200, to: 600, bottom: 0, top: 1500 },
    ]);
    expect(p).toHaveLength(2);
    expect(p[1].outline).toEqual([[2000, 0], [3000, 0], [3000, 2000], [2000, 2000]]);
  });
  it('cuts a raised opening as a hole', () => {
    const p = wallProfiles(3000, 2000, [{ from: 500, to: 1500, bottom: 400, top: 1800 }]);
    expect(p).toHaveLength(1);
    expect(p[0].outline).toHaveLength(4);
    expect(p[0].holes).toEqual([[[500, 400], [1500, 400], [1500, 1800], [500, 1800]]]);
  });
});
