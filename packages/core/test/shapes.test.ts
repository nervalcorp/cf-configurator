import { describe, expect, it } from 'vitest';
import { SHAPES, area, doorWallLength, findDoorEdge, footprint, inToMm, isClockwise, jointNumber, mmToIn, wallFrames, wallLetter } from '../src';

const W = inToMm(150);
const D = inToMm(150);

describe('footprints', () => {
  it.each(SHAPES.map((s) => [s.id, s] as const))('%s is a closed, non-degenerate polygon', (_id, s) => {
    const fp = footprint(s.id, W, D, s.nw, s.nd);
    expect(fp.length).toBeGreaterThanOrEqual(4);
    expect(area(fp)).toBeGreaterThan(0);
    // every edge is axis-aligned
    fp.forEach((a, i) => {
      const b = fp[(i + 1) % fp.length];
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    });
  });

  it('all shapes share one winding direction', () => {
    const windings = new Set(SHAPES.map((s) => isClockwise(footprint(s.id, W, D, s.nw, s.nd))));
    expect(windings.size).toBe(1);
  });

  it('rounds notch sizes to whole inches', () => {
    const fp = footprint('cutout-a', inToMm(147), D, 0.2, 0.2);
    const xs = fp.map(([x]) => mmToIn(x));
    xs.forEach((x) => expect(Number.isInteger(Math.round(x * 1e6) / 1e6)).toBe(true));
  });
});

describe('door wall', () => {
  it('picks the front (max y) edge of a rectangle', () => {
    const fp = footprint('rectangle', W, D, 0, 0);
    const i = findDoorEdge(fp);
    expect(fp[i][1]).toBe(D);
    expect(fp[(i + 1) % fp.length][1]).toBe(D);
  });

  it('measures a front-side notch out of the door wall', () => {
    // tr / bl / bc notches sit on the front edge
    expect(mmToIn(doorWallLength(footprint('cutout-a', W, D, 0.2, 0.2)))).toBe(120);
    expect(mmToIn(doorWallLength(footprint('cutout-b', W, D, 0.2, 0.2)))).toBe(120);
    // br sits on the back edge, so the door wall stays full width
    expect(mmToIn(doorWallLength(footprint('cutout-d', W, D, 0.2, 0.2)))).toBe(150);
  });

  it('stays on the same edge while a notch is resized', () => {
    const a = findDoorEdge(footprint('cutout-a', W, D, 0.2, 0.2));
    const b = findDoorEdge(footprint('cutout-a', W, D, 0.45, 0.45));
    expect(a).toBe(b);
  });
});

describe('labels', () => {
  it('letters the front wall A, then counter-clockwise on the plan', () => {
    const n = 4;
    const front = 2;
    expect(wallLetter(front, front, n)).toBe('A');
    expect(wallLetter(1, front, n)).toBe('B');
    expect(wallLetter(0, front, n)).toBe('C');
    expect(wallLetter(3, front, n)).toBe('D');
  });

  it('numbers joint 1 at the left end of the front wall', () => {
    const fp = footprint('rectangle', W, D, 0, 0);
    const door = findDoorEdge(fp);
    const joints = fp.map((_, i) => jointNumber(i, fp, door));
    const j1 = joints.indexOf(1);
    expect(fp[j1]).toEqual([0, D]);
    expect([...joints].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('wall frames', () => {
  const T = inToMm(4);
  const frames = wallFrames(footprint('rectangle', W, D, 0, 0), T);
  it('runs between the corner posts', () => {
    frames.forEach((f) => expect(mmToIn(f.length)).toBeCloseTo(142, 6));
  });
  it('starts the front wall at its left end, seen from outside', () => {
    const a = frames.find((f) => f.letter === 'A')!;
    expect(a.u[0]).toBeCloseTo(1, 9);
    expect(a.u[1]).toBeCloseTo(0, 9);
    expect(a.n[1]).toBeCloseTo(1, 9);
    expect(a.origin[0]).toBeCloseTo(T, 6);
    expect(a.origin[1]).toBeCloseTo(D - T, 6);
  });
  it('faces every wall outward with u to the right', () => {
    frames.forEach((f) => {
      // u is n turned clockwise on the plan: the right-hand side seen from outside
      expect(f.u[0]).toBeCloseTo(f.n[1], 9);
      expect(f.u[1]).toBeCloseTo(-f.n[0], 9);
    });
  });
});
