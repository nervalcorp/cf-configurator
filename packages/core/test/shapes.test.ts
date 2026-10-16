import { describe, expect, it } from 'vitest';
import { SHAPES, area, doorWallLength, findDoorEdge, footprint, inToMm, isClockwise, jointNumber, mmToIn, panelLetter } from '../src';

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
  it('letters the door wall A/B and the next wall counter-clockwise C', () => {
    const n = 4;
    const door = 2;
    expect(panelLetter(door, door, n, 'left')).toBe('A');
    expect(panelLetter(door, door, n, 'right')).toBe('B');
    expect(panelLetter(1, door, n)).toBe('C');
    expect(panelLetter(0, door, n)).toBe('D');
    expect(panelLetter(3, door, n)).toBe('E');
  });

  it('numbers joint 1 at the left end of the door wall', () => {
    const fp = footprint('rectangle', W, D, 0, 0);
    const door = findDoorEdge(fp);
    const joints = fp.map((_, i) => jointNumber(i, fp, door));
    const j1 = joints.indexOf(1);
    expect(fp[j1]).toEqual([0, D]);
    expect([...joints].sort()).toEqual([1, 2, 3, 4]);
  });
});
