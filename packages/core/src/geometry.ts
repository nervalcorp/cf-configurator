/**
 * 2D polygon helpers for footprints.
 *
 * Footprint space: x runs left→right, y runs back→front. The front of the
 * compartment (where the door goes by default) is the max-y side. In 3D this
 * maps to x → X and y → Z, so the front faces +Z toward the default camera.
 */
export type Vec2 = readonly [number, number];
export type Polygon = readonly Vec2[];

/**
 * Winding test that does not depend on the centroid. The centroid moves when a
 * panel is resized and used to flip normals; the winding never does.
 * Positive sum = clockwise in a y-down screen space.
 */
export function windingSum(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += (b[0] - a[0]) * (b[1] + a[1]);
  }
  return s;
}

export const isClockwise = (poly: Polygon): boolean => windingSum(poly) > 0;

/** Unit outward normal of edge a→b for a polygon with the given winding. */
export function edgeNormal(a: Vec2, b: Vec2, clockwise: boolean): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  let nx = dy / l;
  let ny = -dx / l;
  if (clockwise) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

export function edgeLength(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  depth: number;
  cx: number;
  cy: number;
}

export function bounds(poly: Polygon): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    depth: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/** Shoelace area (always positive). */
export function area(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/**
 * Offset every edge along its outward normal by `dist` (negative = inward).
 * Mitred at corners, which is exact for the axis-aligned footprints we use.
 */
export function offsetPolygon(poly: Polygon, dist: number): Vec2[] {
  const cw = isClockwise(poly);
  const n = poly.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const n1 = edgeNormal(prev, curr, cw);
    const n2 = edgeNormal(curr, next, cw);
    let bx = n1[0] + n2[0];
    let by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl;
    by /= bl;
    const dot = n1[0] * bx + n1[1] * by;
    const scale = dot > 0.1 ? dist / dot : dist;
    out.push([curr[0] + bx * scale, curr[1] + by * scale]);
  }
  return out;
}

/** True when the turn at vertex i points into the shape (a notch corner). */
export function isInsideCorner(poly: Polygon, i: number): boolean {
  const n = poly.length;
  const prev = poly[(i - 1 + n) % n];
  const p = poly[i];
  const next = poly[(i + 1) % n];
  const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
  return isClockwise(poly) ? cross > 0 : cross < 0;
}
