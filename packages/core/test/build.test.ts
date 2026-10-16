import { describe, expect, it } from 'vitest';
import { SHAPES, buildCompartment, defaultCompartment, inToMm, type BoxPart, type ProfilePart } from '../src';

const inside = (poly: readonly (readonly [number, number])[], [x, y]: [number, number]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

const comp = (patch = {}) => ({ ...defaultCompartment(), ...patch });

describe('buildCompartment', () => {
  it('builds a rectangle as 4 posts, 3 panels and a split door wall', () => {
    const t = buildCompartment(comp(), 'indoor');
    const kinds = (k: string) => t.parts.filter((p) => p.kind === k).length;
    expect(kinds('post')).toBe(4);
    expect(kinds('panel')).toBe(3);
    expect(kinds('door-wall')).toBe(2);
    expect(kinds('door-leaf')).toBe(1);
    expect(kinds('floor')).toBe(1);
    expect(kinds('roof')).toBe(0);
    expect(t.walls.map((w) => w.letter)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('adds a roof outdoors and drops the floor when asked', () => {
    const c = comp();
    c.finishes = { ...c.finishes, floor: 'none' };
    const t = buildCompartment(c, 'outdoor');
    expect(t.parts.some((p) => p.kind === 'roof')).toBe(true);
    expect(t.parts.some((p) => p.kind === 'floor')).toBe(false);
    expect(t.floorTop).toBe(0);
  });

  it.each(SHAPES.map((s) => [s.id] as const))('%s: one post per corner, no overlapping panels', (id) => {
    const s = SHAPES.find((x) => x.id === id)!;
    const t = buildCompartment(comp({ shape: id, notchW: s.nw, notchD: s.nd }), 'indoor');
    expect(t.parts.filter((p) => p.kind === 'post').length).toBe(t.footprint.length);
    const boxes = t.parts.filter((p): p is BoxPart => p.kind === 'panel' || p.kind === 'post');
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.abs(a.center[0] - b.center[0]) < (a.size[0] + b.size[0]) / 2 - 0.1;
        const oz = Math.abs(a.center[2] - b.center[2]) < (a.size[2] + b.size[2]) / 2 - 0.1;
        expect(ox && oz, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('puts every exterior face on the outside of the footprint', () => {
    const t = buildCompartment(comp({ shape: 'cutout-e', notchW: 0.4, notchD: 0.2 }), 'indoor');
    for (const p of t.parts) {
      if (p.kind !== 'panel' || !p.exteriorFace) continue;
      const axis = p.exteriorFace[1] === 'x' ? 0 : 2;
      const sign = p.exteriorFace[0] === '+' ? 1 : -1;
      // a point 50 mm past the exterior face must be outside the footprint
      const probe: [number, number] = [p.center[0], p.center[2]];
      probe[axis === 0 ? 0 : 1] += sign * (p.size[axis] / 2 + 50);
      expect(inside(t.footprint, probe), p.id).toBe(false);
    }
  });

  it('keeps the door opening between panel A and panel B', () => {
    const t = buildCompartment(comp(), 'indoor');
    const a = t.parts.find((p) => p.id.endsWith('panel-A')) as ProfilePart;
    const b = t.parts.find((p) => p.id.endsWith('panel-B')) as ProfilePart;
    const leaf = t.parts.find((p) => p.kind === 'door-leaf') as BoxPart;
    expect(a.origin[0]).toBeLessThan(leaf.center[0] - leaf.size[0] / 2);
    expect(b.origin[0]).toBeCloseTo(leaf.center[0], 6);
    expect(leaf.size[0]).toBeCloseTo(inToMm(34), 6);
    expect(a.exteriorFace).toBe('+z');
  });

  it('mirrors the hinges for a left-hinged door', () => {
    const right = buildCompartment(comp(), 'indoor');
    const left = buildCompartment(comp({ door: { ...defaultCompartment().door, hinge: 'left' } }), 'indoor');
    const hx = (t: typeof right) => (t.parts.find((p) => p.kind === 'hinge') as BoxPart).center[0];
    const leaf = right.parts.find((p) => p.kind === 'door-leaf') as BoxPart;
    expect(hx(right)).toBeGreaterThan(leaf.center[0]);
    expect(hx(left)).toBeLessThan(leaf.center[0]);
  });

  it('labels one dimension per edge plus height', () => {
    const t = buildCompartment(comp(), 'indoor');
    expect(t.dimensions.map((d) => d.label)).toEqual(['150"', '150"', '150"', '150"', '100"']);
  });
});
